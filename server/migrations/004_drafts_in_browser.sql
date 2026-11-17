-- A limpeza em andamento passa a viver só no navegador (rascunho) e chega ao servidor num único envio.
-- As que ainda estavam abertas no servidor viram abandonadas, guardando o tempo até agora.
UPDATE cleanings SET
  status = 'abandoned',
  ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  total_ms = active_ms + CASE WHEN running_since IS NULL THEN 0 ELSE CAST((julianday('now') - julianday(running_since)) * 86400000 AS INTEGER) END,
  running_since = NULL
WHERE status = 'in_progress';
