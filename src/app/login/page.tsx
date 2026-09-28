import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-4xl text-gold">BetIQ</h1>
        <p className="mt-2 text-sm text-muted">Accès privé</p>
      </div>
      <LoginForm />
    </main>
  );
}
