import { AppError } from "./auth";
import type { AppState } from "./model";
export function assertVersion(
  current: AppState,
  expected: AppState,
  actualEtag: string | null,
  expectedEtag: unknown,
) {
  if (
    !actualEtag ||
    typeof expectedEtag !== "string" ||
    actualEtag !== expectedEtag ||
    current.revision !== expected.revision
  )
    throw new AppError(
      "Conflicto de versiones. Exporta tu copia local y recarga Drive.",
      409,
    );
}
export function assertSaved(saved: AppState, intended: AppState) {
  if (JSON.stringify(saved) !== JSON.stringify(intended))
    throw new AppError(
      "Se detectó una escritura simultánea. Conserva tu copia local y revisa Drive.",
      409,
    );
}
