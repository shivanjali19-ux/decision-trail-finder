CREATE TABLE public.kg_nodes (
  id text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'current',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.kg_nodes TO authenticated;
GRANT ALL ON public.kg_nodes TO service_role;
ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read nodes" ON public.kg_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert nodes" ON public.kg_nodes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update nodes" ON public.kg_nodes FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.kg_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src text NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  rel text NOT NULL,
  dst text NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  source_id text REFERENCES public.kg_nodes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src, rel, dst)
);
GRANT SELECT, INSERT ON public.kg_edges TO authenticated;
GRANT ALL ON public.kg_edges TO service_role;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read edges" ON public.kg_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert edges" ON public.kg_edges FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX ON public.kg_edges(src); CREATE INDEX ON public.kg_edges(dst);

CREATE TABLE public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_threads FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.chat_messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.kg_nodes (id,type,name,summary,content,props,updated_at) VALUES
('person:maya','person','Maya Chen','VP Engineering','', '{"email":"maya@northwind.io","expertise":["platform strategy","hiring"]}', now()-interval '40 days'),
('person:diego','person','Diego Alvarez','Staff Engineer, Payments','', '{"email":"diego@northwind.io","expertise":["Stripe","ledger design","Postgres"]}', now()-interval '12 days'),
('person:priya','person','Priya Nair','Product Manager, Checkout','', '{"email":"priya@northwind.io","expertise":["checkout UX","pricing experiments"]}', now()-interval '8 days'),
('person:sam','person','Sam Okafor','SRE Lead','', '{"email":"sam@northwind.io","expertise":["Kubernetes","incident response","observability"]}', now()-interval '5 days'),
('person:lena','person','Lena Fischer','Data Engineer','', '{"email":"lena@northwind.io","expertise":["dbt","Snowflake","event pipelines"]}', now()-interval '20 days'),
('person:tom','person','Tom Reyes','Security Engineer','', '{"email":"tom@northwind.io","expertise":["SOC 2","IAM","PCI"]}', now()-interval '30 days'),
('team:payments','team','Payments Team','Owns billing, ledger and payment providers','', '{}', now()-interval '30 days'),
('team:platform','team','Platform & SRE','Owns infrastructure, reliability and on-call','', '{}', now()-interval '30 days'),
('team:data','team','Data Team','Owns analytics warehouse and event pipelines','', '{}', now()-interval '30 days'),
('project:ledger','project','Ledger v2','Rebuild of the double-entry ledger on Postgres','', '{"phase":"build","target":"Q4 2026"}', now()-interval '6 days'),
('project:checkout','project','One-Page Checkout','Redesign checkout into a single page to lift conversion','', '{"phase":"experiment","target":"Q4 2026"}', now()-interval '3 days'),
('project:k8s','project','Kubernetes Migration','Move services from VMs to managed Kubernetes','', '{"phase":"rollout","target":"Q1 2027"}', now()-interval '4 days'),
('doc:ledger-rfc','document','RFC-014: Ledger v2 design','Design doc for Ledger v2','Ledger v2 uses Postgres with append-only journal tables. We evaluated a dedicated ledger DB (TigerBeetle) but chose Postgres for team familiarity and tooling. Idempotency keys are required on every write. Owner: Diego Alvarez.', '{"url":"https://docs.northwind.io/rfc-014"}', now()-interval '25 days'),
('doc:oncall','document','On-call runbook','How on-call rotation and escalation work','Primary on-call rotates weekly across Platform & SRE. Sev1 pages Sam Okafor as escalation. Payments incidents also page Diego Alvarez.', '{"url":"https://docs.northwind.io/oncall"}', now()-interval '15 days'),
('doc:checkout-brief','document','One-Page Checkout brief','Product brief for checkout redesign','Goal: +4% conversion. Experiment runs 50/50 for 3 weeks. Apple Pay is in scope; PayPal deferred to next quarter.', '{"url":"https://docs.northwind.io/checkout-brief"}', now()-interval '18 days'),
('ticket:PAY-212','ticket','PAY-212: Duplicate charges on retry','Bug: retries create duplicate charges','Customers charged twice when the mobile client retries after timeout. Fix: enforce idempotency keys at API gateway. Assigned to Diego. Status: In progress.', '{"status":"in_progress","url":"https://jira.northwind.io/PAY-212"}', now()-interval '2 days'),
('ticket:PLAT-88','ticket','PLAT-88: Migrate payments-api to k8s','Move payments-api to Kubernetes','Blocked until Ledger v2 cutover is complete. Assigned to Sam.', '{"status":"blocked","url":"https://jira.northwind.io/PLAT-88"}', now()-interval '4 days'),
('ticket:DATA-41','ticket','DATA-41: Checkout funnel events','Instrument new checkout funnel','Add step events for one-page checkout to the event pipeline. Assigned to Lena. Status: Done.', '{"status":"done","url":"https://jira.northwind.io/DATA-41"}', now()-interval '9 days'),
('chat:payments-1','chat','#payments thread — ledger database choice','Slack discussion choosing Postgres for ledger','Diego: TigerBeetle is fast but nobody here operates it. Maya: agreed, go with Postgres, revisit at 10x volume. Decision logged.', '{"channel":"#payments","url":"https://slack.northwind.io/archives/payments/p1"}', now()-interval '27 days'),
('chat:checkout-1','chat','#checkout thread — PayPal scope','Slack discussion deferring PayPal','Priya: PayPal adds 3 weeks. Maya: defer to Q1, ship Apple Pay first.', '{"channel":"#checkout","url":"https://slack.northwind.io/archives/checkout/p7"}', now()-interval '19 days'),
('chat:platform-1','chat','#platform thread — k8s sequencing','Slack discussion on migration order','Sam: payments-api should move last, after ledger cutover, to avoid two risky changes at once. Tom: also need PCI review before moving.', '{"channel":"#platform","url":"https://slack.northwind.io/archives/platform/p3"}', now()-interval '10 days'),
('decision:postgres-ledger','decision','Use Postgres for Ledger v2','Chose Postgres over a dedicated ledger DB','Rationale: team familiarity, tooling, operational simplicity. Revisit at 10x transaction volume.', '{"date":"2026-09-19"}', now()-interval '27 days'),
('decision:defer-paypal','decision','Defer PayPal to Q1 2027','Ship Apple Pay first in one-page checkout','Rationale: PayPal adds ~3 weeks; Apple Pay covers most mobile demand.', '{"date":"2026-09-27"}', now()-interval '19 days'),
('decision:payments-last','decision','Migrate payments-api to k8s last','Sequence payments-api after ledger cutover and PCI review','Rationale: avoid stacking two risky changes; PCI review required.', '{"date":"2026-10-06"}', now()-interval '10 days');

INSERT INTO public.kg_edges (src,rel,dst,source_id) VALUES
('person:maya','LEADS','team:platform',NULL),('person:maya','MANAGES','person:diego',NULL),('person:maya','MANAGES','person:sam',NULL),
('person:diego','MEMBER_OF','team:payments',NULL),('person:priya','MEMBER_OF','team:payments',NULL),
('person:sam','MEMBER_OF','team:platform',NULL),('person:tom','MEMBER_OF','team:platform',NULL),('person:lena','MEMBER_OF','team:data',NULL),
('team:payments','OWNS','project:ledger',NULL),('team:payments','OWNS','project:checkout',NULL),('team:platform','OWNS','project:k8s',NULL),
('person:diego','OWNS','project:ledger','doc:ledger-rfc'),('person:priya','OWNS','project:checkout','doc:checkout-brief'),('person:sam','OWNS','project:k8s',NULL),
('person:diego','AUTHORED','doc:ledger-rfc',NULL),('person:sam','AUTHORED','doc:oncall',NULL),('person:priya','AUTHORED','doc:checkout-brief',NULL),
('doc:ledger-rfc','ABOUT','project:ledger',NULL),('doc:checkout-brief','ABOUT','project:checkout',NULL),
('ticket:PAY-212','ASSIGNED_TO','person:diego',NULL),('ticket:PAY-212','PART_OF','project:ledger',NULL),
('ticket:PLAT-88','ASSIGNED_TO','person:sam',NULL),('ticket:PLAT-88','PART_OF','project:k8s',NULL),('ticket:PLAT-88','BLOCKED_BY','project:ledger','chat:platform-1'),
('ticket:DATA-41','ASSIGNED_TO','person:lena',NULL),('ticket:DATA-41','PART_OF','project:checkout',NULL),
('decision:postgres-ledger','AFFECTS','project:ledger',NULL),('decision:postgres-ledger','DECIDED_BY','person:maya',NULL),('decision:postgres-ledger','PROPOSED_BY','person:diego',NULL),('decision:postgres-ledger','SOURCED_FROM','chat:payments-1',NULL),('decision:postgres-ledger','DOCUMENTED_IN','doc:ledger-rfc',NULL),
('decision:defer-paypal','AFFECTS','project:checkout',NULL),('decision:defer-paypal','DECIDED_BY','person:maya',NULL),('decision:defer-paypal','PROPOSED_BY','person:priya',NULL),('decision:defer-paypal','SOURCED_FROM','chat:checkout-1',NULL),('decision:defer-paypal','DOCUMENTED_IN','doc:checkout-brief',NULL),
('decision:payments-last','AFFECTS','project:k8s',NULL),('decision:payments-last','PROPOSED_BY','person:sam',NULL),('decision:payments-last','SOURCED_FROM','chat:platform-1',NULL),('decision:payments-last','AFFECTS','ticket:PLAT-88',NULL),
('person:tom','KNOWS_ABOUT','decision:payments-last','chat:platform-1'),('person:lena','KNOWS_ABOUT','project:checkout','ticket:DATA-41');