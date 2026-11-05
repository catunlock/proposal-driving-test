import math
import wave
import struct

sample_rate = 44100
duration_seconds = 20
num_samples = sample_rate * duration_seconds

# Escala pentatónica mayor (C4, D4, E4, G4, A4, C5) - Muy brillante, alegre y mágica
notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]
sec_per_note = 0.45 

audio_data = []

for i in range(num_samples):
    t = float(i) / sample_rate
    
    # Arpegio mágico (Campanillas)
    pattern_idx = int((math.sin(2 * math.pi * 0.1 * t) * 0.5 + 0.5) * (len(notes) - 1))
    freq = notes[pattern_idx]
    
    # Envolvente percusiva con ATAQUE para eliminar chasquidos (glitches)
    time_in_note = t % sec_per_note
    attack_time = 0.03 # 30 ms de ataque suave
    if time_in_note < attack_time:
        attack = time_in_note / attack_time
    else:
        attack = 1.0
        
    env = attack * math.exp(-(time_in_note) * 6)
    
    # Sintetizar la campanilla
    val = 0.5 * math.sin(2 * math.pi * freq * t)
    val += 0.3 * math.sin(2 * math.pi * freq * 2 * t)
    val += 0.1 * math.sin(2 * math.pi * freq * 4 * t)
    
    # Fondo ambiental MENOS GRAVE (Acorde C mayor)
    pad = 0.0
    for p_freq in [261.63, 329.63, 392.00]: # C4, E4, G4
        pad += 0.1 * math.sin(2 * math.pi * p_freq * t)
    
    # El pad entra suavemente (fade in) y se apaga al final (fade out general)
    pad_env = min(1.0, t / 2.0) 
    global_fade_out = min(1.0, (duration_seconds - t) / 2.0)
    
    # Mezcla: Campanillas + Pad
    mixed = ((val * env * 0.4) + (pad * pad_env * 0.25)) * global_fade_out
    
    if mixed > 1.0: mixed = 1.0
    elif mixed < -1.0: mixed = -1.0
    
    int_val = int(mixed * 32767.0)
    audio_data.append(int_val)

with wave.open('happy_romantic.wav', 'w') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(sample_rate)
    for sample in audio_data:
        wav_file.writeframes(struct.pack('<h', sample))

print("Archivo happy_romantic.wav generado con éxito sin chasquidos.")
