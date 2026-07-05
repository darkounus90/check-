# E06-T7 Defensa 5 - analisis tecnico imagen

## Goal

Implementar la Defensa 5 del motor de verificación antifraude (Épica 6, Grupo B):
análisis técnico de la imagen del comprobante (ELA, EXIF, doble compresión,
resolución/proporción) usando `sharp` + `exifr`, respetando el contrato
`Defense`/`DefenseInput`/`DefenseSignal` definido en E06-T1.

## Requirements

- Analiza `input.imageBytes` (bytes crudos de la imagen del comprobante).
  Si está ausente o vacío → `not_applicable` (D4: no penaliza por dato faltante).
- **ELA (Error Level Analysis)**: recomprime la imagen a una calidad JPEG
  conocida (escala de grises, por bloques) y compara el error de recompresión
  contra sí misma. Un bloque con error desproporcionadamente mayor al resto
  ("hot spot") sugiere una región pegada/editada con distinta historia de
  compresión. Heurístico pragmático con `sharp`, no forense de nivel académico
  (ver limitaciones abajo).
- **EXIF**: usa `exifr` para leer metadata. Presencia de software de edición
  conocido (Photoshop, GIMP, Affinity Photo, Paint.NET, Lightroom, Snapseed)
  en el campo `Software` → señal fuerte. Ausencia total de EXIF en un formato
  que normalmente la trae (JPEG/TIFF) → señal débil únicamente (no dispara
  `fail` por sí sola: muchas capturas de pantalla legítimas de apps bancarias
  tampoco tienen EXIF de cámara).
- **Doble compresión**: se reutiliza el mismo análisis ELA como proxy (mismo
  cálculo, mismo umbral de localización), según lo acordado para el MVP —
  no se implementa un análisis de histograma de coeficientes DCT dedicado.
- **Resolución/proporción**: compara contra rangos esperados de una captura
  de pantalla de app bancaria móvil (proporción `largo/corto` y dimensión
  mínima). Señal débil adicional, nunca dispara `fail` por sí sola.
- Combina todas las señales en un único `DefenseSignal`:
  - Cualquier señal **fuerte** (EXIF con software de edición, o ELA con
    "hot spot" localizado) → `fail`.
  - Si no hay señales fuertes → `pass` (sin `enablesGreen`; esta defensa no es
    la Defensa 1 y nunca habilita 🟢 por sí sola). Las señales débiles solo se
    anotan en `detail` y bajan levemente el `weight`, sin cambiar el `outcome`.
  - Sin `imageBytes` → `not_applicable`.
- Agregar `exifr` y `sharp` a `packages/verifier/package.json` (única tarea
  del Grupo B autorizada a tocar ese archivo en esta ronda paralela).

## Acceptance Criteria

- [x] `imageForensicsDefense: Defense` implementado en
      `packages/verifier/src/defenses/image-forensics.ts`, exportado con ese
      nombre exacto.
- [x] Un comprobante editado conocido (EXIF con software de edición, o imagen
      con región pegada de alta frecuencia detectable por ELA) dispara señal
      de manipulación (`fail`).
- [x] Una imagen limpia (sin EXIF de edición, sin "hot spot" ELA) → `pass`,
      sin `enablesGreen`.
- [x] Sin `imageBytes` (o vacío) → `not_applicable`, no penaliza.
- [x] Tests en `packages/verifier/test/defenses/image-forensics.test.ts` con
      fixtures de imagen sintéticas generadas en el propio test (`sharp`),
      deterministas y rápidos (~0.3 s para 9 casos).
- [x] `pnpm --filter @check/verifier build/typecheck/lint` pasan. El script
      `test` del `package.json` no fue modificado (mismo patrón que las otras
      6 defensas paralelas del Grupo B, que tampoco wirearon sus tests ahí
      todavía — se deja para la integración de E06-T10 y así evitar conflictos
      de merge en la misma línea); el test de esta defensa se verificó
      corriendo `pnpm --filter @check/verifier exec tsx --test test/defenses/image-forensics.test.ts`
      (9/9 pass).

## Notes

- Limitaciones honestas del heurístico ELA/doble-compresión (documentadas
  también en el código, `computeElaAnalysis`):
  - Se analiza en escala de grises (evita desalineación de canal alfa/espacio
    de color entre el decodificador original y el de la recompresión JPEG);
    esto pierde señal de manipulaciones que solo alteran color/saturación sin
    afectar luminancia.
  - No es un ELA forense académico: no analiza cuantización DCT real ni
    histogramas de coeficientes para doble compresión JPEG genuina; es un
    proxy razonable calibrado empíricamente contra imágenes sintéticas de
    prueba (ratio de localización ~0.8x en imágenes limpias vs. ~12x en
    imágenes con parche pegado, a calidad JPEG 60).
  - Los umbrales (`ELA_JPEG_QUALITY`, `ELA_LOCALIZATION_RATIO_THRESHOLD`,
    `ELA_MIN_ABS_DIFF_FOR_LOCALIZATION`, umbrales de aspecto/resolución) son
    fijos y calibrados contra las fixtures sintéticas del test, no contra un
    corpus forense real; recalibración con comprobantes reales queda como
    mejora post-MVP.
- `exifr@^7.1.3` agregado como dependencia nueva; `sharp@^0.34.0` agregado
  también (ya usado por `@check/ocr`, no estaba antes en `@check/verifier`).
