import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    // We place the raw key string here so Next.js doesn't have to parse it from .env.local
    const directPrivateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDuht2IcBIIsVt7\nEuXu1hSd+pPYt5tBl3cqOn8bUat6fD7+r2mOvSTvYrpxukMDDok78fUsp3g2LzgS\nzWtI0ZP73wDKlL02eVYDjOPNfVpE7QGbTsRdMzizKU0u0cD2PHSko9nUYJDLKTRG\ndcD5l1gfwmpQhryfbkDnBLtVaSP9XBtxuGFIIbCyGqVLpPgS0DL/iR8N+7tY/wHw\n5VQd0q2nGZSTSsfSrIoPlGwB88I5zXUERDmlM3NDAPZCn9a3/dtYAR13Rry0Y+kv\n4Vos4J28IUa2FErWevfA+9G5GvclWXuNdMW5OW3uwECvncnR/DKUlnkBzEVcHu3H\nqT4U6HgTAgMBAAECggEAJLbWj4Msi3D9Mz7v7GjASKbCrgdo2to9Cd9yJBrYiaRp\nL9uBJGrhrgUkzI+OdAB/SB5QjhyC6NgwydgbjNxRamHjZcsqKqHXhvlfMQh75gMT\nDbw8hln1fsI7Mpsvl9crXxInW8S3VMYVWUkTuHc+pbjPk3CBxQp76/MzAI0L8Jm6\nNNGDY7VqMknUFUDulzzZcbsqsZZGSOW01HmpgvgecGBDpeJmruNI6hVhQ0Q4fp9+\ncm8FV2e+IU5eieVMFwGkAGcg2z9uwm8IdFw4HzXGHVsBOmleHX9zKMZZ3FT96p6k\nqdLnqqKHQLXpHoli09uE8kDb6af27QdFhYS/gQPGBQKBgQD/YczDVWANgBU75X1N\ntXfqH4bO9pluSfobHLXXudi7H1Fzie+9Wv7s/TVe+J2yygMbGC8kygoDhOg2eStx\nowKf37Qpe/8PoKWzGYCA57Y6MVzHiWyCjHh9jAFEnYw8jfsiBS+3ozH6X8PLHba5\n1CAXNHUf+auzgFUhjyXFBIzNlQKBgQDvGp/SCyZJ755+pqcRE9oTVpWr+nq0hSqY\nR43HKc6KbiHW51+Rsv/7keNTHSthcxCBvfVw3Z8TNp3VxSuCf/6LPo/+uDYghlem\nLztKMO3nq0YPzjI+ZsYf6BISt8Zz2PGSm66gpIV0q0qGsE4jcAn+x8Qa4XrPx+mO\nlUNa3sM1BwKBgQCS2HWZTBozKRcMneTzLgmJwh8OGpYW6Mq7lEKrjN2mm1eGjCYi\nR5SWSPLLbUGgcLBggAN7sAEaDO5JhFsKuKTlsQgzYm1DWyhsV5mghZwu0ft7cPXI\nC2WtKzf/cGgW2b0xzrGlcl1mjnJS9P8A04ywSyWeAT5NtNk+tsUNCJS+EQKBgQDq\n8AM3tMLjhTH8Ci5ARnxR4hLg0BZ/iBWJWU2C855BQOO5MNEj7Xk/LGLsiM3WS+Rd\nR1SCmRC0JUdDBCCzcqafFVMRmtl8beRzoxcj2B37M7x8zUNrMzrboQEZKUAzFmiP\ngK8+o0mKkMCCxXuRsIXxtUIIk6NDxI/GDP4IrLesQwKBgQD8zdCYTl5oLwzra0Hx\nNpcPS1Qg8oTBFWBub3Zty25Tj2hexfx8rpvmUQoV0tSyY2UJYqkbCGgjei/y6rjZ\n4XEuvJkXSutscQ2H0HmiO6d1wMTS0KljEMcZLiwqOUTy8+zjSjOexvkhwFN/MEpv\nUktSWlPlZEAdZi4hzdjV2kxKcg==\n-----END PRIVATE KEY-----\n";

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "kereke-hub",
        clientEmail: "firebase-adminsdk-fbsvc@kereke-hub.iam.gserviceaccount.com",
        privateKey: directPrivateKey.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin successfully initialized.");
  } catch (error) {
    console.error("Firebase admin initialization error:", error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();