CREATE TABLE public.family_members (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membro vê o próprio vínculo" ON public.family_members FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.family_members (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_family_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_members WHERE user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_family_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','income_sources','installments','payment_methods','responsible_users','transactions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Família: edição" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Família: exclusão" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Família: inclusão" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Família: leitura" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Família: leitura" ON public.%I FOR SELECT TO authenticated USING (public.is_family_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Família: inclusão" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_family_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Família: edição" ON public.%I FOR UPDATE TO authenticated USING (public.is_family_member(auth.uid())) WITH CHECK (public.is_family_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Família: exclusão" ON public.%I FOR DELETE TO authenticated USING (public.is_family_member(auth.uid()))', t);
  END LOOP;
END $$;