import crypto from "crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "safedrop-evidence";

/**
 * Generates an AWS Signature V4 pre-signed URL for Cloudflare R2 without
 * requiring heavy external SDKs, keeping your Next.js bundle lean.
 */
function signR2Url(method: "PUT" | "GET", objectKey: string, expiresInSeconds = 900): string {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return `https://r2-mock.safedrop.ng/${method.toLowerCase()}/${objectKey}`;
  }

  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${R2_ACCESS_KEY_ID}/${credentialScope}`;

  const canonicalUri = `/${R2_BUCKET_NAME}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  });
  queryParams.sort();

  const canonicalRequest = [
    method,
    canonicalUri,
    queryParams.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const hmac = (key: Buffer | string, data: string) =>
    crypto.createHmac("sha256", key).update(data).digest();

  const kDate = hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  queryParams.set("X-Amz-Signature", signature);
  return `https://${host}${canonicalUri}?${queryParams.toString()}`;
}

export function createPresignedUploadUrl(
  transactionId: string,
  evidenceType: string,
  filename: string
) {
  const ext = filename.includes(".") ? filename.split(".").pop() : "jpg";
  const objectKey = `transactions/${transactionId}/${evidenceType.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = signR2Url("PUT", objectKey, 900);
  return { objectKey, uploadUrl, expiresIn: 900 };
}

export function createPresignedViewUrl(objectKey: string) {
  return signR2Url("GET", objectKey, 900);
}
