import { isAbsolute, relative } from "node:path";

export function escapedPaths(
	root: string,
	paths: readonly (string | undefined)[],
): string[] {
	const escaped: string[] = [];
	for (const path of paths) {
		if (path === undefined) {
			escaped.push("<absent>");
			continue;
		}
		const rel = relative(root, path);
		if (rel !== "" && (isAbsolute(rel) || rel.startsWith(".."))) {
			escaped.push(path);
		}
	}
	return escaped;
}
