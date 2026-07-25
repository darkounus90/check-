// `qrcode-terminal` no publica tipos; declaración mínima con lo que usamos.
declare module "qrcode-terminal" {
  export function generate(
    input: string,
    opts: { small?: boolean },
    callback: (ascii: string) => void,
  ): void;
  const _default: { generate: typeof generate };
  export default _default;
}
