import { BookOpen, LockKeyhole, ArrowRight, ShieldCheck } from "lucide-react";
import { configured } from "@/lib/auth";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = (await searchParams).error;
  const ready = configured();
  return (
    <main className="login">
      <div className="login-orbit" />
      <section className="login-card">
        <span className="brand-mark">
          <BookOpen size={24} />
        </span>
        <span className="eyebrow">UN LUGAR PARA AVANZAR</span>
        <h1>
          Mi espacio
          <br />
          <span>personal.</span>
        </h1>
        <p>
          Aprende con intención. Organiza tus ideas.
          <br />
          Haz espacio para lo que importa.
        </p>
        <div className="login-divider" />
        <div className="row">
          <LockKeyhole size={18} />
          <strong>Tu espacio, solo para ti</strong>
        </div>
        <p className="muted small">
          Acceso exclusivo con tu cuenta autorizada de Google.
        </p>
        {error && (
          <p role="alert" className="error">
            No se pudo autorizar el acceso. Usa la cuenta configurada y acepta
            los permisos solicitados.
          </p>
        )}
        {ready ? (
          <a className="button button-primary full" href="/api/auth/login">
            Continuar con Google <ArrowRight size={17} />
          </a>
        ) : (
          <div className="notice">
            Falta completar o corregir Google OAuth. Sigue docs/GOOGLE_CLOUD.md,
            configura .env.local, ejecuta npm run check:google y reinicia la
            aplicación.
          </div>
        )}
        <footer>
          <ShieldCheck size={14} /> Datos personales en tu Google Drive
        </footer>
      </section>
    </main>
  );
}
