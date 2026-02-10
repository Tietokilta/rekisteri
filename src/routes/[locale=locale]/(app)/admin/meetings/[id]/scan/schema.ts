import * as v from "valibot";

/**
 * Schema for scanning a member QR code.
 */
export const scanQrSchema = v.object({
  token: v.string(),
});

export type ScanQrInput = v.InferInput<typeof scanQrSchema>;
export type ScanQrOutput = v.InferOutput<typeof scanQrSchema>;
