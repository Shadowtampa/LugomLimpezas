-- Auto-avaliação da limpeza (R10): nota de 1 a 10 e pontos a melhorar, ambos opcionais até o usuário avaliar.
ALTER TABLE cleanings ADD COLUMN score INTEGER CHECK (score BETWEEN 1 AND 10);
ALTER TABLE cleanings ADD COLUMN improvements TEXT;
