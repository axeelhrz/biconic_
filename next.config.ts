import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer, webpack }) => {
    // Si no estamos en el servidor (es decir, estamos en el cliente/navegador)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Le decimos que ignore estos módulos nativos de Node
        fs: false,
        https: false,
        http: false,
        path: false,
        child_process: false,
        tls: false,
        net: false,
      };

      // Plugin para manejar imports con prefijo 'node:' (ej: node:fs)
      // Los convierte a 'fs', que luego es ignorado por el fallback de arriba
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: any) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
    }
    return config;
  },
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  eslint: {
    // Advertencia: Esto permite compilar con errores de ESLint.
    // Es muy recomendable arreglarlos antes de ir a producción.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ruckgiydxoupxuowmhgq.supabase.co",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "gravatar.com",
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com",
      },
      // Añade aquí otros dominios que uses para avatares
    ],
  },
};

export default nextConfig;
