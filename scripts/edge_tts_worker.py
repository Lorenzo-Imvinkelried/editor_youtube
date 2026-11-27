"""
Responsabilidad Única: Worker persistente por stdio (JSON Lines) que sintetiza frases en MP3
mediante las voces neuronales gratuitas de Microsoft (`edge-tts`) sin reiniciar Python por cada
escena, manteniendo soporte UTF-8 estricto para español en Windows.
"""

import asyncio
import base64
import json
import sys
import edge_tts


async def synthesize_mp3_bytes(text: str, voice: str, rate: str, pitch: str) -> bytes:
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
    )
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            chunks.append(chunk["data"])
    return b"".join(chunks)


async def handle_request(payload: dict) -> dict:
    req_id = payload.get("id")
    text = str(payload.get("text") or "").strip()
    voice = str(payload.get("voice") or "es-MX-DaliaNeural").strip()
    rate = str(payload.get("rate") or "+0%").strip()
    pitch = str(payload.get("pitch") or "+0Hz").strip()

    if not text:
        return {"id": req_id, "ok": False, "error": "Texto vacío para sintetizar."}

    # Reintentar 1 vez automáticamente si el WebSocket de Edge corta de forma transitoria
    last_error = None
    for attempt in range(2):
        try:
            mp3_bytes = await synthesize_mp3_bytes(text, voice, rate, pitch)
            if not mp3_bytes:
                raise RuntimeError("Microsoft Edge TTS devolvió un flujo de audio vacío.")
            return {
                "id": req_id,
                "ok": True,
                "audioBase64": base64.b64encode(mp3_bytes).decode("ascii"),
                "byteLength": len(mp3_bytes),
            }
        except Exception as exc:
            last_error = exc
            if attempt == 0:
                await asyncio.sleep(0.45)

    return {"id": req_id, "ok": False, "error": str(last_error)}


async def main() -> None:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    loop = asyncio.get_running_loop()
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except Exception as exc:
            response = {"id": None, "ok": False, "error": f"JSON inválido: {exc}"}
        else:
            response = await handle_request(payload)

        sys.stdout.write(json.dumps(response, ensure_ascii=True) + "\n")
        sys.stdout.flush()

    await loop.shutdown_asyncgens()


if __name__ == "__main__":
    asyncio.run(main())
