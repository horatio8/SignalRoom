-- Demo seed: the two mock campaigns from the design prototype.
-- The full view-model fixtures live in src/lib/data/{voss,marsh}.ts; this seed
-- creates the tenant rows + default alert rules (§7 + the S11 group-chatter
-- rule) so a freshly-provisioned project matches the app's expectations.

insert into campaigns (slug, name, country, timezone, plan, briefing_hour, digest_hours, message_platform_version)
values
  ('voss',  'Voss for Senate', 'US', 'America/Phoenix',   'fight',  6, '{16}', 'v3'),
  ('marsh', 'Marsh for Mayor', 'AU', 'Australia/Sydney',  'advise', 6, '{16}', 'v2');

-- Default rule set installed per campaign (spec §7 + S11)
insert into alert_rules (campaign_id, name, rule, severity, channels, cooldown_minutes)
select c.id, r.name, r.rule::jsonb, r.severity, '[{"type":"email"}]'::jsonb, r.cooldown
from campaigns c
cross join (values
  ('Negative spike',      '{"when":"cluster_velocity","threshold":{"multiple":3},"filters":{"sentiment_below":-20}}', 'urgent', 60),
  ('Big-reach hit',       '{"when":"single_mention","threshold":{"reach_percentile":95},"filters":{"sentiment_below":0}}', 'urgent', 60),
  ('Opponent surge',      '{"when":"opponent","threshold":{"multiple":3}}', 'watch', 120),
  ('New narrative',       '{"when":"cluster_velocity","threshold":{"mentions":15,"window_hours":2}}', 'watch', 60),
  ('Sentiment slide',     '{"when":"sentiment_shift","threshold":{"points":15,"window":"day"}}', 'watch', 1440),
  ('Group chatter shift', '{"when":"sentiment_shift","scope":"monitored_groups","threshold":{"points":12,"volume_multiple":3}}', 'watch', 1440)
) as r(name, rule, severity, cooldown);
