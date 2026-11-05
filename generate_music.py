import math
import wave
import struct

sample_rate = 44100
duration_seconds = 20
num_samples = sample_rate * duration_seconds

# Frecuencias para un acorde Cmaj9 (Romántico y mágico)
frequencies = [130.81, 196.00, 246.94, 293.66, 329.63]
# Drone grave para suspense (Do 2)
drone_freq = 65.41 

audio_data = []

for i in range(num_samples):
    t = float(i) / sample_rate
    
    # Envelope de volumen: Entra suavemente en 4 segundos, se mantiene, y cae en los ultimos 2s
    envelope = min(1.0, t / 4.0) * min(1.0, (duration_seconds - t) / 2.0)
    
    # Efecto de respiración lenta (Tremolo)
    breathing = 0.8 + 0.2 * math.sin(2 * math.pi * 0.1 * t)
    
    # Sintetizar el acorde
    sample_val = 0.0
    for idx, freq in enumerate(frequencies):
        # Ligeramente desafinado (chorus) para hacerlo más envolvente
        detune = 1.0 + 0.001 * math.sin(2 * math.pi * 0.3 * t + idx)
        f = freq * detune
        # Frecuencias altas mas suaves
        amp = 1.0 / (idx + 1.5)
        sample_val += amp * math.sin(2 * math.pi * f * t)
    
    # Añadir drone grave de suspense
    drone_val = 0.6 * math.sin(2 * math.pi * drone_freq * t)
    
    # Latido del corazon (50Hz), dos golpes cada segundo
    beat_time = t % 1.0
    heartbeat = 0.0
    if beat_time < 0.15:
        heartbeat = math.sin(2 * math.pi * 50 * t) * math.exp(-beat_time * 25)
    elif 0.25 < beat_time < 0.4:
        heartbeat = math.sin(2 * math.pi * 50 * t) * math.exp(-(beat_time - 0.25) * 25)
    
    # Mezcla final
    mixed = (sample_val * 0.08 + drone_val * 0.2 + heartbeat * 0.7) * envelope * breathing
    
    # Limitador suave para no distorsionar
    if mixed > 1.0: mixed = 1.0
    elif mixed < -1.0: mixed = -1.0
    
    # Convertir a 16-bit PCM
    int_val = int(mixed * 32767.0)
    audio_data.append(int_val)

# Escribir el archivo WAV
with wave.open('suspense_romantic.wav', 'w') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(sample_rate)
    for sample in audio_data:
        wav_file.writeframes(struct.pack('<h', sample))

print("Archivo suspense_romantic.wav generado con éxito.")
