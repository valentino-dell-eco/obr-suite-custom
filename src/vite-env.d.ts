/// <reference types="vite/client" />

declare module "*.css";
declare const require: {
  (id: string): unknown;
  resolve(id: string): string;
};

interface ImportMetaEnv {
  /** Character-card backend (echo-version-backend Worker), e.g. https://echo-version-backend.<subdomain>.workers.dev */
  readonly VITE_CC_BACKEND?: string;
}
