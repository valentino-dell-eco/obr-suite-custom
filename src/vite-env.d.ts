/// <reference types="vite/client" />

declare module "*.css";
declare const require: {
  (id: string): unknown;
  resolve(id: string): string;
};

interface ImportMetaEnv {
  /** Character-card backend (obr-suite-backend Worker), e.g. https://obr-suite-backend.<subdomain>.workers.dev */
  readonly VITE_CC_BACKEND?: string;
}
