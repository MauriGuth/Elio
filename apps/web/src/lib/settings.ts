const STORAGE_KEY = "nova_settings"

export type SecuritySettings = {
  minPasswordLength: number
  requireUppercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  sessionTimeoutMinutes: number
  maxLoginAttempts: number
}

const defaultSecurity: SecuritySettings = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  sessionTimeoutMinutes: 480,
  maxLoginAttempts: 5,
}

export function getSecuritySettings(): SecuritySettings {
  if (typeof window === "undefined") return defaultSecurity
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultSecurity, ...parsed.security }
    }
  } catch {
    /* ignore */
  }
  return defaultSecurity
}

export function validatePassword(
  password: string,
  security: SecuritySettings = getSecuritySettings()
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (password.length < security.minPasswordLength) {
    errors.push(
      `La contraseña debe tener al menos ${security.minPasswordLength} caracteres.`
    )
  }
  if (security.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("La contraseña debe contener al menos una mayúscula.")
  }
  if (security.requireNumbers && !/\d/.test(password)) {
    errors.push("La contraseña debe contener al menos un número.")
  }
  if (security.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push("La contraseña debe contener al menos un carácter especial.")
  }
  return { valid: errors.length === 0, errors }
}
