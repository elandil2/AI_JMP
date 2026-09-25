-- Retain the existing model choices while accepting the new default Flash model.
alter table public.batches
  drop constraint batches_model_check,
  add constraint batches_model_check
  check (model in ('gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'));

alter table public.generation_events
  drop constraint generation_events_model_check,
  add constraint generation_events_model_check
  check (model in ('gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'));
