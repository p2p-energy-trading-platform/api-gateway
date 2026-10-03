-- Token bucket rate limiter using GCRA (Generic Cell Rate Algorithm).
--
-- One key per client and policy. It stores the "theoretical arrival time" (TAT): the moment
-- the bucket would be completely refilled. Requests refill smoothly over the window, so there
-- are no bursts at window boundaries like a fixed "100 per minute" counter has.
--
-- Runs atomically inside Redis, so concurrent requests from any number of gateway replicas
-- cannot both pass the check.
--
-- KEYS[1] = rate-limit key
-- ARGV[1] = limit      (max requests per window)
-- ARGV[2] = window_ms  (window length in milliseconds)
--
-- Returns { allowed (1/0), remaining, retry_after_ms, reset_ms }

local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])

-- Use Redis server time so all gateway replicas share one clock.
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

-- Time it takes for one request "token" to refill.
local interval = window_ms / limit

local tat = tonumber(redis.call('GET', KEYS[1]))
if tat == nil or tat < now then
  tat = now
end

local new_tat = tat + interval
local allowed_at = new_tat - window_ms

if allowed_at > now then
  -- Rejected: the bucket is empty. Nothing is written.
  return { 0, 0, math.ceil(allowed_at - now), math.ceil(tat - now) }
end

-- Allowed: store the new TAT. The key expires once the bucket is full again.
redis.call('SET', KEYS[1], tostring(new_tat), 'PX', math.ceil(new_tat - now))

local remaining = math.floor((now + window_ms - new_tat) / interval)

return { 1, remaining, 0, math.ceil(new_tat - now) }
