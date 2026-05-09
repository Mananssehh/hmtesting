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
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          reviewed: boolean
          route: string | null
          severity: Database["public"]["Enums"]["error_severity"]
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          reviewed?: boolean
          route?: string | null
          severity?: Database["public"]["Enums"]["error_severity"]
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          reviewed?: boolean
          route?: string | null
          severity?: Database["public"]["Enums"]["error_severity"]
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_banned_guests: {
        Row: {
          created_at: string
          event_id: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_banned_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_blocklist: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          kind: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          kind: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          kind?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_blocklist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_integrations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          ingest_token: string
          last_seen_at: string | null
          settings: Json
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          ingest_token?: string
          last_seen_at?: string | null
          settings?: Json
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          ingest_token?: string
          last_seen_at?: string | null
          settings?: Json
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_integrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          event_id: string
          id: string
          joined_at: string
          last_seen_at: string
          nickname: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          nickname?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string
          last_seen_at?: string
          nickname?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_explicit: boolean
          archived_at: string | null
          cooldown_seconds: number
          created_at: string
          dj_id: string
          dj_name: string
          ended_at: string | null
          id: string
          is_active: boolean
          name: string
          requests_status: string
          require_approval: boolean
          room_code: string
          rules_text: string | null
          venue: string | null
        }
        Insert: {
          allow_explicit?: boolean
          archived_at?: string | null
          cooldown_seconds?: number
          created_at?: string
          dj_id: string
          dj_name: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          requests_status?: string
          require_approval?: boolean
          room_code: string
          rules_text?: string | null
          venue?: string | null
        }
        Update: {
          allow_explicit?: boolean
          archived_at?: string | null
          cooldown_seconds?: number
          created_at?: string
          dj_id?: string
          dj_name?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          requests_status?: string
          require_approval?: boolean
          room_code?: string
          rules_text?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      now_playing: {
        Row: {
          album_art: string | null
          artist: string | null
          created_at: string
          event_id: string
          id: string
          source: string | null
          source_track_id: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          album_art?: string | null
          artist?: string | null
          created_at?: string
          event_id: string
          id?: string
          source?: string | null
          source_track_id?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          album_art?: string | null
          artist?: string | null
          created_at?: string
          event_id?: string
          id?: string
          source?: string | null
          source_track_id?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "now_playing_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      points_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          reason: string
          song_request_id: string | null
          type: Database["public"]["Enums"]["point_tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          reason?: string
          song_request_id?: string | null
          type: Database["public"]["Enums"]["point_tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          reason?: string
          song_request_id?: string | null
          type?: Database["public"]["Enums"]["point_tx_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_transactions_song_request_id_fkey"
            columns: ["song_request_id"]
            isOneToOne: false
            referencedRelation: "song_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          is_premium: boolean
          nickname: string
          points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_premium?: boolean
          nickname?: string
          points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_premium?: boolean
          nickname?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      song_requests: {
        Row: {
          album: string | null
          album_art: string | null
          album_art_url: string | null
          artist: string
          boost: number
          created_at: string
          downvotes: number
          duration_ms: number | null
          event_id: string
          explicit: boolean
          external_url: string | null
          id: string
          preview_url: string | null
          queue_position: number | null
          requested_by: string | null
          requester_name: string
          source_platform: string | null
          source_song_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          upvotes: number
        }
        Insert: {
          album?: string | null
          album_art?: string | null
          album_art_url?: string | null
          artist: string
          boost?: number
          created_at?: string
          downvotes?: number
          duration_ms?: number | null
          event_id: string
          explicit?: boolean
          external_url?: string | null
          id?: string
          preview_url?: string | null
          queue_position?: number | null
          requested_by?: string | null
          requester_name?: string
          source_platform?: string | null
          source_song_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          upvotes?: number
        }
        Update: {
          album?: string | null
          album_art?: string | null
          album_art_url?: string | null
          artist?: string
          boost?: number
          created_at?: string
          downvotes?: number
          duration_ms?: number | null
          event_id?: string
          explicit?: boolean
          external_url?: string | null
          id?: string
          preview_url?: string | null
          queue_position?: number | null
          requested_by?: string | null
          requester_name?: string
          source_platform?: string | null
          source_song_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          upvotes?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      votes: {
        Row: {
          created_at: string
          id: string
          song_request_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          song_request_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          song_request_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_song_request_id_fkey"
            columns: ["song_request_id"]
            isOneToOne: false
            referencedRelation: "song_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          id: string | null
          nickname: string | null
          points: number | null
        }
        Insert: {
          id?: string | null
          nickname?: string | null
          points?: number | null
        }
        Update: {
          id?: string | null
          nickname?: string | null
          points?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      award_points: {
        Args: {
          _amount: number
          _created_by?: string
          _event_id: string
          _reason?: string
          _song_request_id?: string
          _type: Database["public"]["Enums"]["point_tx_type"]
          _user_id: string
        }
        Returns: undefined
      }
      boost_request: {
        Args: { _amount: number; _song_request_id: string }
        Returns: {
          album: string | null
          album_art: string | null
          album_art_url: string | null
          artist: string
          boost: number
          created_at: string
          downvotes: number
          duration_ms: number | null
          event_id: string
          explicit: boolean
          external_url: string | null
          id: string
          preview_url: string | null
          queue_position: number | null
          requested_by: string | null
          requester_name: string
          source_platform: string | null
          source_song_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          upvotes: number
        }
        SetofOptions: {
          from: "*"
          to: "song_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_dj_role: { Args: never; Returns: undefined }
      dj_award_points: {
        Args: {
          _amount: number
          _event_id: string
          _reason: string
          _user_id: string
        }
        Returns: undefined
      }
      ensure_demo_event: {
        Args: { _code: string }
        Returns: {
          allow_explicit: boolean
          archived_at: string | null
          cooldown_seconds: number
          created_at: string
          dj_id: string
          dj_name: string
          ended_at: string | null
          id: string
          is_active: boolean
          name: string
          requests_status: string
          require_approval: boolean
          room_code: string
          rules_text: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_nickname: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recent_request_count: {
        Args: { _event_id: string; _seconds?: number }
        Returns: number
      }
      reset_demo_events: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "dj" | "guest"
      error_severity: "critical" | "warning" | "info"
      point_tx_type: "earned" | "spent" | "manual_adjustment"
      request_status:
        | "pending"
        | "approved"
        | "playing"
        | "played"
        | "skipped"
        | "removed"
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
      app_role: ["dj", "guest"],
      error_severity: ["critical", "warning", "info"],
      point_tx_type: ["earned", "spent", "manual_adjustment"],
      request_status: [
        "pending",
        "approved",
        "playing",
        "played",
        "skipped",
        "removed",
      ],
    },
  },
} as const
