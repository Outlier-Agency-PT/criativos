import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { readdir, readFile, access, constants, stat } from "fs/promises";
import { resolve, join, extname, relative } from "path";

const MAX_FILES = 200;
const ALLOWED_EXTS = [".md", ".txt"];

/**
 * Recursively collect all .txt and .md files from a directory tree.
 */
async function collectFiles(
  dirPath: string,
  basePath: string,
  collected: { name: string; content: string; path: string; relativePath: string }[],
  maxFiles: number
): Promise<void> {
  if (collected.length >= maxFiles) return;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort: files first, then directories (alphabetical)
  const files = entries.filter((e) => e.isFile());
  const dirs = entries.filter((e) => e.isDirectory());

  for (const entry of files) {
    if (collected.length >= maxFiles) break;
    const ext = extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) continue;

    const filePath = join(dirPath, entry.name);
    try {
      const content = await readFile(filePath, "utf-8");
      collected.push({
        name: entry.name,
        content,
        path: filePath,
        relativePath: relative(basePath, filePath),
      });
    } catch {
      continue;
    }
  }

  for (const dir of dirs) {
    if (collected.length >= maxFiles) break;
    // Skip hidden directories
    if (dir.name.startsWith(".")) continue;
    await collectFiles(join(dirPath, dir.name), basePath, collected, maxFiles);
  }
}

/**
 * POST /api/copy-library/import-local
 * Reads .txt and .md files recursively from a local directory tree.
 * ONLY works in development (localhost). Returns 404 in production.
 */
export async function POST(request: NextRequest) {
  // Server-side guard: development only
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { directoryPath, orgId } = body as {
      directoryPath?: string;
      orgId?: string;
    };

    await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json(
        { error: "orgId obrigatorio" },
        { status: 400 }
      );
    }

    if (!directoryPath || !directoryPath.trim()) {
      return NextResponse.json(
        { error: "directoryPath obrigatorio" },
        { status: 400 }
      );
    }

    const resolvedPath = resolve(directoryPath.trim());

    // Validate directory exists and is readable
    try {
      const dirStat = await stat(resolvedPath);
      if (!dirStat.isDirectory()) {
        return NextResponse.json(
          { error: "Caminho nao e um diretorio" },
          { status: 400 }
        );
      }
      await access(resolvedPath, constants.R_OK);
    } catch {
      return NextResponse.json(
        { error: "Diretorio nao encontrado ou sem permissao de leitura" },
        { status: 404 }
      );
    }

    // Recursively collect files
    const files: { name: string; content: string; path: string; relativePath: string }[] = [];
    await collectFiles(resolvedPath, resolvedPath, files, MAX_FILES);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Nenhum ficheiro .txt ou .md encontrado no diretorio ou subpastas" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      files,
      total: files.length,
      read: files.length,
      truncated: files.length >= MAX_FILES,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

