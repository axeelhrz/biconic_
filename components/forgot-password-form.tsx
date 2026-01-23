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
import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Plus } from "lucide-react";


export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) {
        throw new Error("Ocurrió un error al enviar el enlace de recuperación. Por favor, verifica tu correo electrónico.");
      }
      setSuccess(true);
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
    <div className={cn("flex min-h-screen w-full overflow-hidden shadow-2xl p-6 relative",
      "bg-gradient-to-tr from-[#24767E] to-[#15161C]",
      className)}
      {...props}
    >
      {/* Columna izquierda: diseño informativo */}
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
            Integra datos, transfórmalos, construye dashboards y entrégalos al cliente con branding propio y personalizables, de manera fácil, didáctica, sin código y sin requerir mucho conocimiento.
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
            <div className="mb-4 flex justify-start">
              <img
                className="biconic-logo pb-12"
                src="/images/biconic2-logo.png"
                alt="Biconic Logo"
                width="160"
                height="36"
                loading="lazy"
              />
            </div>
            {success ? (
              <>
                <CardTitle className="pb-5 text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-[#2DD4BF] to-[#29A097]">
                  ¡Revisa tu correo!
                </CardTitle>
                <CardDescription className="mt-1 text-black dark:text-black">
                  Hemos enviado instrucciones para restablecer tu contraseña.
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-[#26E3B1] to-[#0DC7E7]">
                  Recuperar contraseña
                </CardTitle>
                <CardDescription className="mt-1 text-black dark:text-black">Ingresa tu correo electrónico</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {success ? (
              <p className="text-sm text-center text-black dark:text-black pb-12">
                Si registraste tu cuenta con este correo, recibirás un enlace para restablecer tu contraseña.
              </p>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5 pb-12">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-black dark:text-black">Correo electrónico *</Label>
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
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className={buttonClasses}
                  disabled={isLoading}
                >
                  {isLoading ? "Enviando..." : (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#66F2A5]">
                        <Plus size={24} stroke="#000000" />
                      </div>
                      Continuar
                      <ChevronRight />
                    </>
                  )}
                </Button>
              </form>
            )}
          {/* Footer */}
              <div className="mt-8 grid grid-cols-1 items-center justify-items-center gap-2 text-xs text-black sm:grid-cols-3 sm:gap-4">
                <a href="#" className="hover:underline sm:justify-self-start">©2025</a>
                <a href="#" className="hover:underline">Términos de servicio</a>
                <a href="#" className="hover:underline sm:justify-self-end">Política de privacidad</a>
              </div>            
          </CardContent>            
        </Card>
        
      </div>
    </div>
  );
}