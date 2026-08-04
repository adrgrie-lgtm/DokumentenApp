
-- Enums
CREATE TYPE public.document_category AS ENUM (
  'wohngeld','buergergeld','kindergeld','pflege','krankenkasse','finanzen','arbeit','versicherungen','sonstiges'
);
CREATE TYPE public.document_status AS ENUM ('hochgeladen','wird_analysiert','analysiert','fehler');
CREATE TYPE public.chat_role AS ENUM ('user','assistant');

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Master data (Stammdaten)
CREATE TABLE public.master_data (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  street TEXT,
  house_number TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'Deutschland',
  birth_date DATE,
  phone TEXT,
  email TEXT,
  marital_status TEXT,
  children_count INTEGER DEFAULT 0,
  iban TEXT,
  bic TEXT,
  bank_name TEXT,
  id_card_number TEXT,
  tax_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_data TO authenticated;
GRANT ALL ON public.master_data TO service_role;
ALTER TABLE public.master_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own master data" ON public.master_data FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_master_data_updated BEFORE UPDATE ON public.master_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents
CREATE TABLE public.documents (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  category public.document_category NOT NULL DEFAULT 'sonstiges',
  status public.document_status NOT NULL DEFAULT 'hochgeladen',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON public.documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_documents_user ON public.documents(user_id);

-- Analyses
CREATE TABLE public.document_analyses (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT,
  summary TEXT,
  deadlines JSONB NOT NULL DEFAULT '[]'::jsonb,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_analyses TO authenticated;
GRANT ALL ON public.document_analyses TO service_role;
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own analyses" ON public.document_analyses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_analyses_document ON public.document_analyses(document_id);

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.chat_role NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat messages" ON public.chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_document ON public.chat_messages(document_id);

-- Storage policies: each user has their own folder named after their user id
CREATE POLICY "Users read own files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
