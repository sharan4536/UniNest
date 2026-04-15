/**
 * UniNest End-to-End Encryption Utilities
 * Uses Web Crypto API: ECDH (P-256) for Key Exchange, AES-GCM (256-bit) for Encryption.
 */

// Key Pair Interface
export interface KeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}

// Storage Keys
const PRIV_KEY_STORAGE = 'uninest_priv_key';
const PUB_KEY_STORAGE = 'uninest_pub_key';

// Generate ECDH Key Pair (P-256)
export const generateKeyPair = async (): Promise<KeyPair> => {
    return window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        false, // Private key non-extractable? For MVP we might need to export if we want backup. Let's keep false for stricter security per prompt.
        // Wait, if false, we can't save it to IndexedDB/LocalStorage easily unless browser supports structured clone of CryptoKey.
        // Most browsers do support storing CryptoKey in IndexedDB. LocalStorage needs JSON (export).
        // Given "Private keys must never leave device", we will try to make them extractable solely for local persistence.
        ["deriveKey", "deriveBits"]
    ) as Promise<KeyPair>;
};

// Export Key to JWK (for storage/transmit)
export const exportKey = async (key: CryptoKey): Promise<JsonWebKey> => {
    return window.crypto.subtle.exportKey("jwk", key);
};

// Import Key from JWK
export const importKey = async (jwk: JsonWebKey, type: 'public' | 'private'): Promise<CryptoKey> => {
    return window.crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        type === 'private', // Extractable?
        type === 'private' ? ["deriveKey", "deriveBits"] : []
    );
};

// Store Keys Locally (MVP: LocalStorage, but ideally IndexedDB)
export const storeLocalKeys = async (keyPair: KeyPair) => {
    const pubJWK = await exportKey(keyPair.publicKey);
    const privJWK = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey); // Needs to be extractable for this method

    // We need to re-generate keys with extractable=true for this simple storage method
    // Or use IndexedDB to store non-extractable keys.
    // For this MVP, let's use extractable=true and warn about it.
    localStorage.setItem(PUB_KEY_STORAGE, JSON.stringify(pubJWK));
    localStorage.setItem(PRIV_KEY_STORAGE, JSON.stringify(privJWK));
};

// Get Local Keys
export const getLocalKeys = async (): Promise<KeyPair | null> => {
    const pubStr = localStorage.getItem(PUB_KEY_STORAGE);
    const privStr = localStorage.getItem(PRIV_KEY_STORAGE);

    if (!pubStr || !privStr) return null;

    try {
        const publicKey = await importKey(JSON.parse(pubStr), 'public');
        const privateKey = await importKey(JSON.parse(privStr), 'private');
        return { publicKey, privateKey };
    } catch (e) {
        console.error("Error loading keys", e);
        return null;
    }
};

// Derive Shared Secret (AES-GCM Key)
export const deriveSharedKey = async (privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> => {
    return window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: publicKey,
        },
        privateKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );
};

// Encrypt Message
export const encryptMessage = async (text: string, sharedKey: CryptoKey): Promise<string> => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const encodedText = new TextEncoder().encode(text);

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        sharedKey,
        encodedText
    );

    // Combine IV and Ciphertext for storage: IV (12 bytes) + Ciphertext
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Convert to Base64
    return btoa(String.fromCharCode(...combined));
};

// Decrypt Message
export const decryptMessage = async (encryptedBase64: string, sharedKey: CryptoKey): Promise<string> => {
    try {
        const combinedStr = atob(encryptedBase64);
        const combined = new Uint8Array(combinedStr.length);
        for (let i = 0; i < combinedStr.length; i++) {
            combined[i] = combinedStr.charCodeAt(i);
        }

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            sharedKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        return "[E2EE Error: Decryption Failed]"; // Fallback text
    }
};

// Initialize Keys Helper
export const initializeE2EE = async (): Promise<JsonWebKey | null> => {
    let keys = await getLocalKeys();
    if (!keys) {
        // Generate new keys (extractable for localStorage persistence)
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            true, // Extractable
            ["deriveKey", "deriveBits"]
        ) as KeyPair;

        await storeLocalKeys(keyPair);
        return await exportKey(keyPair.publicKey);
    }
    return null; // Keys already exist
};
