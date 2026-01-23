"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Plus } from "lucide-react";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    // Validación de contraseñas
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/protected`,
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) throw error;
      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ocurrió un error inesperado.");
    } finally {
      setIsLoading(false);
    }
  };

  const buttonClasses = cn(
    "w-full rounded-full py-6 font-semibold flex items-center justify-center gap-2",
    "bg-[#1B7062] hover:bg-[#155A4E] text-white"
  );

  return (
    <div
      className={cn(
        "flex min-h-screen items-center w-full overflow-hidden shadow-2xl bg-gradient-to-tr from-[#24767E] to-[#15161C] p-6 relative",
        className
      )}
      {...props}
    >
      {/* Columna izquierda: gradiente, ícono y copy */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-end h-full">
        <div className="max-w-md text-center text-white/90 justify-center">
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
          <p className="mt-4 text-sm text-white/80">
            Integra datos, transfórmalos, construye dashboards y entrégalos al
            cliente con branding propio y personalizables, de manera fácil,
            didáctica, sin código y sin requerir mucho conocimiento.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white/80" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
            <span className="h-2 w-2 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
      {/* Columna derecha: tarjeta con formulario */}
      <div className="flex w-full lg:w-1/2 justify-center pt-2 pb-2">
        <Card className="w-full max-w-xl shadow-none border-0 rounded-3xl p-6 bg-white">
          <CardHeader className="text-center">
            <div className="mb-4 flex-start">
              <img
                className="biconic-logo pb-12"
                src="/images/biconic2-logo.png"
                alt="Biconic Logo"
                width="160"
                height="36"
                loading="lazy"
              />
            </div>
            <CardTitle className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-[#26E3B1] to-[#0DC7E7]">
              Registro
            </CardTitle>
            <CardDescription className="mt-1 text-black dark:text-black">
              Crea tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="first-name" className="text-black dark:text-black">
                    Primer nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="first-name"
                    type="text"
                    placeholder="Ingrese"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-lg h-12"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last-name" className="text-black dark:text-black">
                    Primer apellido <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="last-name"
                    type="text"
                    placeholder="Ingrese"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-lg h-12"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-black dark:text-black">
                  Correo electrónico <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Ingrese"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-lg text-black dark:text-black"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-black dark:text-black">
                  Contraseña <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite la contraseña"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-lg pr-10 text-black dark:text-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password" className="text-black dark:text-black">
                  Confirmar contraseña <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Digite la contraseña"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 rounded-lg pr-10 text-black dark:text-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-500 font-medium text-center">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full rounded-full py-6 font-semibold flex items-center justify-center gap-2",
                  "bg-[#1B7062] hover:bg-[#155A4E] text-white"
                )}
              >
                {isLoading ? "Creando cuenta..." : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#66F2A5]">
                      <Plus size={24} stroke="#000000" />
                    </div>
                    <span>Ingresar</span>
                    <ChevronRight />
                  </>
                )}
              </Button>
            </form>
            {/* Footer pequeño */}
            <div className="mt-8 flex items-center justify-end text-xs text-black space-x-4">
              <a href="#" className="hover:underline mr-20">©2025 </a>
              <span className="mx-2">•</span>
              <a href="#" className="hover:underline ml-20">Términos de servicio </a>
              <span className="mx-2">•</span>
              <a href="#" className="hover:underline ml-20">Política de privacidad </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}