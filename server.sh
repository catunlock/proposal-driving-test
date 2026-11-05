#!/bin/bash
# Lanza un servidor web local en el puerto 8000 usando Python

echo "Iniciando servidor web en http://localhost:8000"

# Comprueba si existe python3, de lo contrario usa python
if command -v python3 &>/dev/null; then
    python3 server.py
elif command -v python &>/dev/null; then
    python server.py
else
    echo "Error: Python no está instalado en este sistema."
    exit 1
fi
