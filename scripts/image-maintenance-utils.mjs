import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ENV_PATH = path.resolve(process.cwd(), ".env.local");

export async function loadEnv(envPath = DEFAULT_ENV_PATH) {
  const raw = await fs.readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function withTempDir(prefix, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  try {
    return await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);

    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
    });

    child.stderr.on("data", (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed: ${stderr.toString()}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function downloadStorageObject(supabase, bucket, filePath) {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error || !data) {
    throw new Error(`Falha ao baixar ${bucket}/${filePath}: ${error?.message || "sem dados"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function uploadStorageObject(supabase, bucket, filePath, buffer, mimeType) {
  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Falha ao enviar ${bucket}/${filePath}: ${error.message}`);
  }
}

export async function probeImage(filePath) {
  const { stdout } = await runCommand("/opt/homebrew/bin/ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    filePath,
  ]);

  const parsed = JSON.parse(stdout.toString("utf8"));
  const stream = parsed.streams?.[0];
  return {
    width: Number(stream?.width || 0),
    height: Number(stream?.height || 0),
  };
}

export async function probeImageBuffer(buffer, originalPath) {
  return withTempDir("criativos-probe", async (tempDir) => {
    const inputPath = path.join(tempDir, path.basename(originalPath));
    await fs.writeFile(inputPath, buffer);
    return probeImage(inputPath);
  });
}

export async function optimizeImageBuffer({
  buffer,
  originalPath,
  mimeType,
  maxDimension = 1600,
}) {
  return withTempDir("criativos-image-opt", async (tempDir) => {
    const inputPath = path.join(tempDir, path.basename(originalPath));
    const extension = path.extname(originalPath).toLowerCase() || ".jpg";
    const outputPath = path.join(tempDir, `optimized${extension}`);

    await fs.writeFile(inputPath, buffer);

    const filter = `scale='min(${maxDimension},iw)':'min(${maxDimension},ih)':force_original_aspect_ratio=decrease`;

    if (mimeType === "image/png" || extension === ".png") {
      const palettePath = path.join(tempDir, "palette.png");
      await runCommand("/opt/homebrew/bin/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `${filter},palettegen=max_colors=256:stats_mode=diff`,
        palettePath,
      ]);

      await runCommand("/opt/homebrew/bin/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-i",
        palettePath,
        "-lavfi",
        `${filter} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`,
        "-compression_level",
        "9",
        outputPath,
      ]);
    } else if (mimeType === "image/webp" || extension === ".webp") {
      await runCommand("/opt/homebrew/bin/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-quality",
        "82",
        "-compression_level",
        "6",
        outputPath,
      ]);
    } else {
      await runCommand("/opt/homebrew/bin/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-q:v",
        "4",
        outputPath,
      ]);
    }

    const optimizedBuffer = await fs.readFile(outputPath);
    const dimensions = await probeImage(outputPath);

    return {
      buffer: optimizedBuffer,
      width: dimensions.width,
      height: dimensions.height,
      changed: optimizedBuffer.length < buffer.length || dimensions.width > 0 || dimensions.height > 0,
    };
  });
}

export async function normalizedVisualHashFromBuffer(buffer, originalPath) {
  return withTempDir("criativos-visual-hash", async (tempDir) => {
    const inputPath = path.join(tempDir, path.basename(originalPath));
    await fs.writeFile(inputPath, buffer);

    const { stdout } = await runCommand("/opt/homebrew/bin/ffmpeg", [
      "-v",
      "error",
      "-i",
      inputPath,
      "-vf",
      "scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=white,format=rgb24",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);

    return sha256(stdout);
  });
}

export function parseFlags(argv) {
  return {
    apply: argv.includes("--apply"),
    bucket: argv.find((arg) => arg.startsWith("--bucket="))?.split("=")[1] || null,
  };
}
