export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string
          document_id: string
          id: string
          role: Database["public"]["Enums"]["chat_role"]
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          id?: string
          role: Database["public"]["Enums"]["chat_role"]
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          role?: Database["public"]["Enums"]["chat_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analyses: {
        Row: {
          contacts: Json
          created_at: string
          deadlines: Json
          doc_type: string | null
          document_id: string
          field_explanations: Json
          id: string
          missing_info: Json
          raw: Json | null
          required_fields: Json
          summary: string | null
          user_id: string
        }
        Insert: {
          contacts?: Json
          created_at?: string
          deadlines?: Json
          doc_type?: string | null
          document_id: string
          field_explanations?: Json
          id?: string
          missing_info?: Json
          raw?: Json | null
          required_fields?: Json
          summary?: string | null
          user_id: string
        }
        Update: {
          contacts?: Json
          created_at?: string
          deadlines?: Json
          doc_type?: string | null
          document_id?: string
          field_explanations?: Json
          id?: string
          missing_info?: Json
          raw?: Json | null
          required_fields?: Json
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_favorite: boolean
          mime_type: string | null
          status: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_favorite?: boolean
          mime_type?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_favorite?: boolean
          mime_type?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      master_data: {
        Row: {
          bank_name: string | null
          bic: string | null
          birth_date: string | null
          children_count: number | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string | null
          house_number: string | null
          iban: string | null
          id: string
          id_card_number: string | null
          last_name: string | null
          marital_status: string | null
          phone: string | null
          postal_code: string | null
          street: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          birth_date?: string | null
          children_count?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          house_number?: string | null
          iban?: string | null
          id?: string
          id_card_number?: string | null
          last_name?: string | null
          marital_status?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          birth_date?: string | null
          children_count?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          house_number?: string | null
          iban?: string | null
          id?: string
          id_card_number?: string | null
          last_name?: string | null
          marital_status?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      chat_role: "user" | "assistant"
      document_category:
        | "wohngeld"
        | "buergergeld"
        | "kindergeld"
        | "pflege"
        | "krankenkasse"
        | "finanzen"
        | "arbeit"
        | "versicherungen"
        | "sonstiges"
      document_status:
        | "hochgeladen"
        | "wird_analysiert"
        | "analysiert"
        | "fehler"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chat_role: ["user", "assistant"],
      document_category: [
        "wohngeld",
        "buergergeld",
        "kindergeld",
        "pflege",
        "krankenkasse",
        "finanzen",
        "arbeit",
        "versicherungen",
        "sonstiges",
      ],
      document_status: [
        "hochgeladen",
        "wird_analysiert",
        "analysiert",
        "fehler",
      ],
    },
  },
} as const
