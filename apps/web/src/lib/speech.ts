/**
 * Utilidad de voz para anuncios de comandas (mesas/comandas, cocina, cafetería, displays).
 * - Desbloqueo en móvil: el navegador solo permite hablar tras un gesto del usuario (ej. tocar "Voz ON").
 * - Misma voz ES (prioridad femenina, como el default de Mesas) y ritmo en todo el POS.
 */

/** Ritmo único para frases cortas y para cada chunk de anuncios largos. */
const POS_SPEECH_RATE = 0.88
const PAUSE_BETWEEN_CHUNKS_MS = 700
const UNLOCK_PHRASE = "Listo."

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null
  return window.speechSynthesis
}

/** Chrome a veces deja el sintetizador en pausa; conviene reanudar antes de cada locución. */
function prepareSynth(synth: SpeechSynthesis): void {
  try {
    synth.resume()
  } catch {
    /* noop */
  }
}

/** Nombres/etiquetas típicos de voces femeninas en ES (macOS Paulina/Mónica, Edge Sabina, etc.). */
const FEMALE_VOICE_HINTS =
  /paulina|mónica|monica|sof(i|í)a|laura|sabina|esmeralda|valentina|helena|elena|in[eé]s|conchita|victoria|mariana|natalia|dalia|imelda|paloma|female|femenina|mujer|isabella|paula/i

/** Voces masculinas explícitas; evitar como predeterminadas. */
const MALE_VOICE_HINTS =
  /diego|jorge|carlos|juan|pablo|andr[eé]s|roberto|ricardo|alberto|mart[ií]n|dav[ií]d|gonzalo|ignacio|male|masculino|hombre/i

/**
 * Voz en español alineada con lo que suena en Mesas: prioridad a voces femeninas del sistema.
 * No forzar "Google español" (suele ser voz masculina en Chrome).
 */
export function getSpanishVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"))
  if (voices.length === 0) return null

  const female = voices.find((v) => FEMALE_VOICE_HINTS.test(v.name))
  if (female) return female

  const esArNonGoogle = voices.find((v) => {
    const n = v.name.toLowerCase()
    return (
      v.lang.toLowerCase().startsWith("es-ar") &&
      !n.includes("google") &&
      !MALE_VOICE_HINTS.test(n)
    )
  })
  if (esArNonGoogle) return esArNonGoogle

  const anyNonGoogle = voices.find((v) => {
    const n = v.name.toLowerCase()
    return !n.includes("google") && !MALE_VOICE_HINTS.test(n)
  })
  if (anyNonGoogle) return anyNonGoogle

  // Sin candidata clara: no fijar .voice — el navegador usa el default de `lang` (en macOS suele ser Paulina).
  return null
}

/** Misma configuración de voz/idioma que `speakShort` / `speakAnnouncement` (p. ej. feedback en mesas). */
export function applyPosSpeechToUtterance(utt: SpeechSynthesisUtterance): void {
  const synth = getSynth()
  utt.lang = "es-AR"
  utt.rate = POS_SPEECH_RATE
  utt.volume = 1
  if (synth) {
    const voice = getSpanishVoice(synth)
    if (voice) utt.voice = voice
  }
}

/**
 * Llama desde un gesto del usuario (ej. clic en "Voz ON") para desbloquear la voz en móvil.
 * Habla una frase mínima para que el navegador permita hablar después.
 */
export function unlockAudio(): void {
  const synth = getSynth()
  if (!synth) return
  prepareSynth(synth)
  synth.cancel()
  // Volumen audible: con 0.1 muchos operarios creían que "la voz no anda"
  const utt = new SpeechSynthesisUtterance(UNLOCK_PHRASE)
  applyPosSpeechToUtterance(utt)
  utt.rate = 0.9
  utt.volume = 0.45
  let unlockSpoke = false
  const speakUnlock = () => {
    if (unlockSpoke) return
    unlockSpoke = true
    prepareSynth(synth)
    synth.speak(utt)
  }
  if (synth.getVoices().length === 0) {
    synth.onvoiceschanged = () => {
      speakUnlock()
    }
    setTimeout(() => {
      speakUnlock()
      synth.onvoiceschanged = null
    }, 600)
  } else {
    speakUnlock()
  }
}

/**
 * Parte el texto en frases cortas para que se entienda mejor (TV/parlantes).
 * Devuelve array de strings para decir uno tras otro con pausa.
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const bySentence = trimmed.split(/(?<=[.])\s+/).filter(Boolean)
  const result: string[] = []
  for (const part of bySentence) {
    if (part.length <= 60) {
      result.push(part)
    } else {
      const byComma = part.split(/(?<=[,])\s+/)
      for (let i = 0; i < byComma.length && result.length < 4; i++) {
        result.push(byComma[i].trim())
      }
    }
  }
  if (result.length === 0) result.push(trimmed)
  return result.slice(0, 4)
}

/**
 * Dice un anuncio en frases cortas (misma voz/ritmo que el resto del POS) y llama onDone al terminar.
 * Usar después de haber llamado unlockAudio() al menos una vez (desde un clic).
 */
export function speakAnnouncement(
  text: string,
  onDone: () => void
): void {
  const synth = getSynth()
  if (!synth) {
    onDone()
    return
  }
  prepareSynth(synth)
  synth.cancel()
  const chunks = chunkText(text)
  if (chunks.length === 0) {
    onDone()
    return
  }
  let index = 0
  function speakNext() {
    if (index >= chunks.length) {
      onDone()
      return
    }
    prepareSynth(synth)
    const utt = new SpeechSynthesisUtterance(chunks[index])
    applyPosSpeechToUtterance(utt)
    utt.onend = () => {
      index++
      if (index < chunks.length) {
        setTimeout(speakNext, PAUSE_BETWEEN_CHUNKS_MS)
      } else {
        onDone()
      }
    }
    utt.onerror = () => {
      index++
      setTimeout(() => speakNext(), 100)
    }
    synth.speak(utt)
  }
  setTimeout(() => speakNext(), 200)
}

/**
 * Versión corta para un solo mensaje (ej. "Mesa 5 lista") sin partir en chunks.
 */
export function speakShort(text: string, onDone?: () => void): void {
  const synth = getSynth()
  if (!synth) {
    onDone?.()
    return
  }
  prepareSynth(synth)
  synth.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  applyPosSpeechToUtterance(utt)
  utt.onend = () => onDone?.()
  utt.onerror = () => onDone?.()
  setTimeout(() => {
    prepareSynth(synth)
    synth.speak(utt)
  }, 200)
}

export function cancelSpeech(): void {
  getSynth()?.cancel()
}
