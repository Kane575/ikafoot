-- IKAFOOT — schéma PostgreSQL
-- Appliqué par `npm run db:migrate` (idempotent, ré-exécutable sans risque).

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Propriétaire',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un créneau type se répète chaque semaine : « tous les lundis de 10h à 12h ».
-- weekday : 0 = lundi ... 6 = dimanche.
CREATE TABLE IF NOT EXISTS slot_templates (
  id            SERIAL PRIMARY KEY,
  weekday       SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  players       TEXT NOT NULL DEFAULT '5 vs 5',
  weekday_price INTEGER NOT NULL CHECK (weekday_price >= 0) DEFAULT 25000,
  weekend_price INTEGER NOT NULL CHECK (weekend_price >= 0) DEFAULT 30000,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (weekday, start_time)
);

-- Cycle de vie d'une réservation :
--   pending    le client a réservé, il doit verser l'acompte (moitié du prix)
--   confirmed  le propriétaire a encaissé l'acompte
--   expired    l'acompte n'est pas arrivé à temps, le créneau est libéré
--   cancelled  annulée par le client ou par le propriétaire
CREATE TABLE IF NOT EXISTS bookings (
  id              SERIAL PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  template_id     INTEGER NOT NULL REFERENCES slot_templates(id) ON DELETE RESTRICT,
  booking_date    DATE NOT NULL,
  customer_name   TEXT NOT NULL,
  phone           TEXT NOT NULL,
  players         TEXT NOT NULL,
  price           INTEGER NOT NULL CHECK (price >= 0),
  deposit         INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at    TIMESTAMPTZ
);

-- Rattrapage pour une base créée avant l'acompte : ces instructions ne font
-- rien sur une base neuve, et remettent une ancienne base à niveau.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ;
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD  CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired'));

-- Garde-fou principal : la base elle-même refuse deux réservations vivantes sur
-- le même créneau le même jour, même si deux clients cliquent en même temps.
-- Une réservation en attente d'acompte bloque le créneau, sinon l'acompte ne
-- garantirait rien. L'index couvrait auparavant le seul statut 'confirmed' :
-- on le recrée pour qu'il couvre aussi 'pending'.
DROP INDEX IF EXISTS bookings_slot_unique;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique
  ON bookings (template_id, booking_date)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS bookings_phone_idx ON bookings (phone);
CREATE INDEX IF NOT EXISTS bookings_date_idx  ON bookings (booking_date DESC);

-- Sert le balayage des options périmées, exécuté à chaque affichage du planning.
CREATE INDEX IF NOT EXISTS bookings_hold_idx
  ON bookings (hold_expires_at)
  WHERE status = 'pending';
