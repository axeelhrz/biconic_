"use client";

import { cn } from "@/lib/utils";
import { backendClient } from "@/lib/api/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { PasswordInput } from "./ui/PasswordInput";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { user } = await backendClient.auth.login(email, password);
      const home =
        user.app_role === "APP_ADMIN"
          ? "/admin"
          : user.app_role === "VIEWER"
            ? "/viewer"
            : "/dashboard";
      router.push(home);
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado.";
      const isNetworkError =
        typeof message === "string" &&
        (message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network") ||
          message.toLowerCase().includes("err_failed"));
      setError(
        isNetworkError
          ? "No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 4000)."
          : message
      );
    } finally {
      setIsLoading(false);
    }
  };

  const buttonClasses = cn(
    "w-full h-10 rounded-full font-semibold flex items-center justify-center",
    "py-[clamp(0.9rem,2.6vh,1.5rem)] gap-2 md:gap-3",
    "bg-[#1B7062] hover:bg-[#155A4E] text-white"
  );

  return (
    <div className="flex max-w-7xl w-full items-stretch p-5 gap-6 lg:gap-12 xl:gap-16 2xl:gap-20 relative">
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-end py-2">
        <div className="max-w-md xl:max-w-lg 2xl:max-w-xl text-center text-white/90 justify-center">
          <div className="mb-4 flex justify-center">
            <img
              className="biconic-logo"
              src="/images/switch-icon.png"
              alt="Switch Icon"
              width="60"
              height="60"
              loading="lazy"
            />
          </div>
          <h2 className="text-3xl font-bold leading-tight">
            BIpartner
            <br />
            by Biconic
          </h2>
          <p className="mt-4 text-sm text-white/80 ">
            Integra datos, transfórmalos, construye dashboards y entrégalos al
            cliente con branding propio y personalizables, de manera fácil,
            didáctica, sin código y sin requerir mucho conocimiento.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#08CDEF]" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
          </div>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 justify-center py-2">
        <div className="w-full max-w-screen shadow-none border-0 rounded-3xl bg-white px-6 md:px-10 lg:px-[60px] xl:px-[60px] 2xl:px-[60px] py-[clamp(0.75rem,3.5vh,3rem)]">
          <div className="flex h-full flex-col">
            <div className="text-center">
              <div className="mb-[clamp(1rem,5vh,10rem)]">
                <img
                  className="biconic-logo w-[clamp(140px,18vw,175px)] h-auto"
                  src="/images/biconic2-logo.png"
                  alt="Biconic Logo"
                  width="120"
                  height="35"
                  loading="lazy"
                />
              </div>
              <div>
                <div className="font-bold bg-clip-text text-transparent custom-gradient-text text-[clamp(1.25rem,2vw,2.5rem)]">
                  Bienvenido
                </div>
                <div className="text-black dark:text-black">
                  Ingresa tus credenciales
                </div>
              </div>
            </div>

            <div className="mb-[clamp(1rem,5vh,10rem)]">
              <form
                onSubmit={handleLogin}
                className="space-y-[clamp(1rem,2.5vh,1.5rem)] text-[#66687E]"
              >
                <div className="grid gap-2 ">
                  <Label htmlFor="email" className="">
                    Correo electrónico <span className="text-[#02B8D1]">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Ingrese"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-lg "
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password" className="">
                      Contraseña <span className="text-[#02B8D1]">*</span>
                    </Label>
                  </div>
                  <div className="relative">
                    <PasswordInput
                      id="password"
                      placeholder="Digite la contraseña"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-lg text-black dark:text-black"
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-[#0692AA] hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className={buttonClasses}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Ingresando..."
                  ) : (
                    <>
                      <div className="flex h-4 w-4 md:h-6 md:w-6 items-center justify-center rounded-full bg-[#66F2A5]">
                        <Plus size={24} stroke="#000000" />
                      </div>
                      Ingresar
                      <ChevronRight />
                    </>
                  )}
                </Button>

                <div className="text-center text-sm text-black dark:text-black">
                  ¿No tienes cuenta?{" "}
                  <Link
                    href="/auth/sign-up"
                    className="text-[#2DD4BF] underline underline-offset-4"
                  >
                    Regístrate
                  </Link>
                </div>
              </form>
            </div>

            <div className="flex items-center justify-center sm:justify-end text-xs text-black gap-3 sm:gap-6 xl:gap-8">
              <a href="#" className="hover:underline">
                ©2025
              </a>
              <span className="opacity-60">•</span>
              <a href="#" className="hover:underline">
                Términos de servicio
              </a>
              <span className="opacity-60">•</span>
              <a href="#" className="hover:underline">
                Política de privacidad
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
