#!/usr/bin/env bash
# Roda UMA vez, com sudo, no servidor: sudo deploy/install.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo deploy/install.sh" >&2; exit 1; }
USER_NAME="${SUDO_USER:-}"
[ -n "$USER_NAME" ] && [ "$USER_NAME" != root ] || { echo "Rode via sudo a partir do usuário dono do clone." >&2; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT=lugom-limpezas
SYSTEMCTL="$(command -v systemctl)"

# Prepara o app (Node 24 + dependências + build) sem reiniciar nada, como o dono do clone.
sudo -u "$USER_NAME" env NO_PULL=1 NO_RESTART=1 "$DIR/deploy/deploy.sh"

sed -e "s#@USER@#$USER_NAME#g" -e "s#@DIR@#$DIR#g" "$DIR/deploy/lugom-limpezas.service" > "/etc/systemd/system/$UNIT.service"

# Libera sem senha só restart e status deste serviço; valida antes de ativar.
TMP="$(mktemp)"
cat > "$TMP" <<RULES
$USER_NAME ALL=(root) NOPASSWD: $SYSTEMCTL restart $UNIT, $SYSTEMCTL status $UNIT, $SYSTEMCTL status $UNIT --no-pager
RULES
visudo -cf "$TMP" >/dev/null
install -m 0440 -o root -g root "$TMP" "/etc/sudoers.d/$UNIT"
rm -f "$TMP"

systemctl daemon-reload
systemctl enable --now "$UNIT"
echo "Serviço $UNIT instalado e iniciado."
