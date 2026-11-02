declare module "qrcode-terminal" {
  const qrcodeTerminal: {
    generate(value: string, options?: { small?: boolean }, callback?: () => void): void;
  };
  export default qrcodeTerminal;
}
