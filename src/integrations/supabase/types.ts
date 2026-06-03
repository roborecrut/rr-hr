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
      candidates: {
        Row: {
          created_at: string
          current_stage: Database["public"]["Enums"]["candidate_stage"]
          id: string
          landing_slug: string | null
          project_id: string | null
          ref_source: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name: string | null
          resume_text: string | null
          role_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          id?: string
          landing_slug?: string | null
          project_id?: string | null
          ref_source?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          role_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          id?: string
          landing_slug?: string | null
          project_id?: string | null
          ref_source?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          role_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          about_text: string | null
          created_at: string
          id: string
          is_published: boolean
          logo_url: string | null
          mission_text: string | null
          name: string
          owner_employer_id: string
          payouts_text: string | null
          schedule_text: string | null
          slug: string | null
          stats: Json
          system_text: string | null
          team_text: string | null
          updated_at: string
        }
        Insert: {
          about_text?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          name: string
          owner_employer_id: string
          payouts_text?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
        }
        Update: {
          about_text?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          name?: string
          owner_employer_id?: string
          payouts_text?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_employer_id_fkey"
            columns: ["owner_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      employers: {
        Row: {
          bonus_granted: boolean
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_tg: string | null
          created_at: string
          id: string
          plan: string | null
          ref_by: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_tg?: string | null
          created_at?: string
          id?: string
          plan?: string | null
          ref_by?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_tg?: string | null
          created_at?: string
          id?: string
          plan?: string | null
          ref_by?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          google_email: string | null
          id: string
          locale: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id: string
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id?: string
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_landings: {
        Row: {
          created_at: string
          hero: Json
          id: string
          project_id: string
          published_at: string | null
          sections: Json
          slug: string
          theme: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero?: Json
          id?: string
          project_id: string
          published_at?: string | null
          sections?: Json
          slug: string
          theme?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero?: Json
          id?: string
          project_id?: string
          published_at?: string | null
          sections?: Json
          slug?: string
          theme?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_landings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cabinet_tabs_text: string | null
          company_id: string | null
          company_text: string | null
          created_at: string
          created_tasks: boolean
          custom_wiki: string | null
          employer_id: string
          id: string
          is_published: boolean
          logo_url: string | null
          mission_text: string | null
          motivation_text: string | null
          motivation_text_detail: string | null
          onboarding_text: string | null
          payouts_text: string | null
          role_name: string
          salary_terms: string | null
          schedule_terms: string | null
          schedule_text: string | null
          slug: string | null
          stats: Json
          system_text: string | null
          tasks_activity_text: string | null
          team_text: string | null
          training_product_text: string | null
          training_prof_text: string | null
          training_system_text: string | null
          updated_at: string
          vacancy_text: string | null
        }
        Insert: {
          cabinet_tabs_text?: string | null
          company_id?: string | null
          company_text?: string | null
          created_at?: string
          created_tasks?: boolean
          custom_wiki?: string | null
          employer_id: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          role_name: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_system_text?: string | null
          updated_at?: string
          vacancy_text?: string | null
        }
        Update: {
          cabinet_tabs_text?: string | null
          company_id?: string | null
          company_text?: string | null
          created_at?: string
          created_tasks?: boolean
          custom_wiki?: string | null
          employer_id?: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          role_name?: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_system_text?: string | null
          updated_at?: string
          vacancy_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          auth_date: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          photo_url: string | null
          source: string | null
          telegram_id: number
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          auth_date?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          source?: string | null
          telegram_id: number
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          auth_date?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          source?: string | null
          telegram_id?: number
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      test_connection: {
        Row: {
          created_at: string
          id: number
          status: string
          test_name: string
        }
        Insert: {
          created_at?: string
          id?: never
          status?: string
          test_name?: string
        }
        Update: {
          created_at?: string
          id?: never
          status?: string
          test_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employer" | "candidate"
      candidate_stage:
        | "terms"
        | "interview"
        | "scoring"
        | "training"
        | "certified"
      message_sender: "candidate" | "recruiter" | "ai"
      question_category:
        | "checklist_prof"
        | "checklist_sys"
        | "train_prof"
        | "train_product"
        | "train_sys"
        | "roleplay"
      quiz_type: "select" | "text"
      registration_method: "google" | "telegram" | "email"
      tg_direction: "in" | "out"
      tx_type: "topup" | "purchase" | "bonus" | "refund" | "ai_cost"
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
      app_role: ["admin", "employer", "candidate"],
      candidate_stage: [
        "terms",
        "interview",
        "scoring",
        "training",
        "certified",
      ],
      message_sender: ["candidate", "recruiter", "ai"],
      question_category: [
        "checklist_prof",
        "checklist_sys",
        "train_prof",
        "train_product",
        "train_sys",
        "roleplay",
      ],
      quiz_type: ["select", "text"],
      registration_method: ["google", "telegram", "email"],
      tg_direction: ["in", "out"],
      tx_type: ["topup", "purchase", "bonus", "refund", "ai_cost"],
    },
  },
} as const
