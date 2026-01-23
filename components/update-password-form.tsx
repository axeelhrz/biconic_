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
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Plus, ChevronRight } from "lucide-react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Password validation state
  const [hasEightChars, setHasEightChars] = useState(false);
  const [hasUppercase, setHasUppercase] = useState(false);
  const [hasLowercase, setHasLowercase] = useState(false);
  const [hasNumber, setHasNumber] = useState(false);
  const [hasSpecialChar, setHasSpecialChar] = useState(false);

  useEffect(() => {
    setHasEightChars(password.length >= 8);
    setHasUppercase(/[A-Z]/.test(password));
    setHasLowercase(/[a-z]/.test(password));
    setHasNumber(/[0-9]/.test(password));
    setHasSpecialChar(/[^A-Za-z0-9]/.test(password));
  }, [password]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (!hasEightChars || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      setError("La contraseña no cumple con los requisitos de seguridad.");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/protected");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ocurrió un error");
    } finally {
      setIsLoading(false);
    }
  };

  const PasswordRequirement = ({ text, isValid }: { text: string; isValid: boolean }) => (
    <div className="flex items-center gap-2 text-sm">
      {isValid ? (
        <CheckCircle className="text-green-500 h-4 w-4" />
      ) : (
        <XCircle className="text-gray-400 h-4 w-4" />
      )}
      <span className={isValid ? "text-green-500" : "text-gray-400"}>
        {text}
      </span>
    </div>
  );

  const buttonClasses = cn(
    "flex items-center justify-center space-x-2 rounded-full py-2.5 font-semibold text-white transition-colors",
    "bg-gradient-to-r from-[#2DD4BF] to-[#0DC7E7] hover:from-[#0DC7E7] hover:to-[#2DD4BF]",
    isLoading && "opacity-50 cursor-not-allowed"
  );

  return (
    <div className=" flex min-h-screen items-center w-full overflow-hidden shadow-2xl bg-gradient-to-tr from-[#24767E] to-[#15161C] p-6 relative">
      {/* Columna izquierda optimizada: solo una div para el contenido */}
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
          <p className="mt-4 text-sm text-white/80 ">
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
              Recuperar contraseña
            </CardTitle>
            <CardDescription className="mt-1 text-black dark:text-black">
              Ingresa tu contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-5 pb-12">
              <div className="grid gap-2">
                <Label htmlFor="password">Nueva contraseña *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Ingresa tu nueva contraseña"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-lg text-black dark:text-black"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirmar contraseña *</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Ingresa tu nueva contraseña"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 rounded-lg text-black dark:text-black"
                />
              </div>

              <div className="p-4 rounded-lg border border-gray-200 bg-[#ECFDF4]">
                <p className="font-semibold text-sm mb-2">Tu contraseña debe contener:</p>
                <div className="grid grid-cols-1 gap-2">
                  <PasswordRequirement text="Al menos 8 caracteres" isValid={hasEightChars} />
                  <PasswordRequirement text="Una letra mayúscula" isValid={hasUppercase} />
                  <PasswordRequirement text="Una letra minúscula" isValid={hasLowercase} />
                  <PasswordRequirement text="Un número" isValid={hasNumber} />
                  <PasswordRequirement text="Un carácter especial" isValid={hasSpecialChar} />
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              
              <Button type="submit" className={buttonClasses} disabled={isLoading}>
                {isLoading ? "Actualizando..." : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#66F2A5]">
                      <Plus size={24} stroke="#000000" />
                    </div >
                    Actualizar contraseña
                    <ChevronRight />
                  </>
                )}
              </Button>
            </form>
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