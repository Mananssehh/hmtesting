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
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      boost_purchases: {
        Row: {
          amount_cents: number
          consent_version: string | null
          created_at: string
          currency: string
          event_id: string | null
          id: string
          song_request_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          consent_version?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          song_request_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          consent_version?: string | null
          created_at?: string
          currency?: string
          event_id?: string | null
          id?: string
          song_request_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_pair_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: string
          ip?: string
          success?: boolean
        }
        Relationships: []
      }
      bridge_pairing_codes: {
        Row: {
          claimed_at: string | null
          claimed_ip: string | null
          code: string
          created_at: string
          created_by: string
          event_id: string
          expires_at: string
          id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_ip?: string | null
          code: string
          created_at?: string
          created_by: string
          event_id: string
          expires_at: string
          id?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_ip?: string | null
          code?: string
          created_at?: string
          created_by?: string
          event_id?: string
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      dj_payout_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          details_submitted: boolean
          last_synced_at: string | null
          livemode: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          last_synced_at?: string | null
          livemode?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          last_synced_at?: string | null
          livemode?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dj_role_claims: {
        Row: {
          attempted_at: string
          id: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      dj_tips: {
        Row: {
          artist: string | null
          created_at: string
          currency: string
          dj_id: string
          event_id: string | null
          failure_reason: string | null
          gross_amount_cents: number
          guest_nickname: string | null
          id: string
          livemode: boolean
          net_amount_cents: number
          platform_fee_cents: number
          refund_id: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          song_request_id: string | null
          song_title: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_destination_account: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artist?: string | null
          created_at?: string
          currency?: string
          dj_id: string
          event_id?: string | null
          failure_reason?: string | null
          gross_amount_cents: number
          guest_nickname?: string | null
          id?: string
          livemode?: boolean
          net_amount_cents: number
          platform_fee_cents: number
          refund_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          song_request_id?: string | null
          song_title?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_destination_account?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artist?: string | null
          created_at?: string
          currency?: string
          dj_id?: string
          event_id?: string | null
          failure_reason?: string | null
          gross_amount_cents?: number
          guest_nickname?: string | null
          id?: string
          livemode?: boolean
          net_amount_cents?: number
          platform_fee_cents?: number
          refund_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          song_request_id?: string | null
          song_title?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_destination_account?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dj_tips_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dj_tips_song_request_id_fkey"
            columns: ["song_request_id"]
            isOneToOne: false
            referencedRelation: "song_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
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
      guest_funnel_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_funnel_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      now_playing: {
        Row: {
          album_art: string | null
          apple_url: string | null
          artist: string | null
          created_at: string
          event_id: string
          id: string
          now_playing_request_id: string | null
          source: string | null
          source_track_id: string | null
          spotify_url: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          album_art?: string | null
          apple_url?: string | null
          artist?: string | null
          created_at?: string
          event_id: string
          id?: string
          now_playing_request_id?: string | null
          source?: string | null
          source_track_id?: string | null
          spotify_url?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          album_art?: string | null
          apple_url?: string | null
          artist?: string | null
          created_at?: string
          event_id?: string
          id?: string
          now_playing_request_id?: string | null
          source?: string | null
          source_track_id?: string | null
          spotify_url?: string | null
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
          is_public: boolean
          nickname: string
          points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_premium?: boolean
          is_public?: boolean
          nickname?: string
          points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_premium?: boolean
          is_public?: boolean
          nickname?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchase_consents: {
        Row: {
          accepted_at: string
          id: string
          ip: unknown
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: unknown
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: unknown
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      rate_limit_logs: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          event_id: string | null
          id: string
          reason: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          event_id?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          event_id?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      song_metadata: {
        Row: {
          album: string | null
          album_art_url: string | null
          apple_url: string | null
          artist: string | null
          cached_at: string
          duration_ms: number | null
          expires_at: string
          explicit: boolean
          id: string
          normalized_query: string
          provider_ids: Json
          results: Json
          spotify_url: string | null
          title: string | null
        }
        Insert: {
          album?: string | null
          album_art_url?: string | null
          apple_url?: string | null
          artist?: string | null
          cached_at?: string
          duration_ms?: number | null
          expires_at?: string
          explicit?: boolean
          id?: string
          normalized_query: string
          provider_ids?: Json
          results?: Json
          spotify_url?: string | null
          title?: string | null
        }
        Update: {
          album?: string | null
          album_art_url?: string | null
          apple_url?: string | null
          artist?: string | null
          cached_at?: string
          duration_ms?: number | null
          expires_at?: string
          explicit?: boolean
          id?: string
          normalized_query?: string
          provider_ids?: Json
          results?: Json
          spotify_url?: string | null
          title?: string | null
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
          played_at: string | null
          played_by_source: string | null
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
          played_at?: string | null
          played_by_source?: string | null
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
          played_at?: string | null
          played_by_source?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      tip_analytics: {
        Row: {
          amount_cents: number | null
          dj_id: string | null
          event_id: string | null
          purchase_id: string | null
          status: string | null
          tipped_at: string | null
          tipper_id: string | null
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
          played_at: string | null
          played_by_source: string | null
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
      check_boost_purchase_cap: {
        Args: { _amount_cents: number; _event_id: string; _user_id: string }
        Returns: undefined
      }
      check_tip_cap: {
        Args: { _amount_cents: number; _event_id: string; _user_id: string }
        Returns: undefined
      }
      claim_dj_role: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_profile: { Args: { p_nickname: string }; Returns: Json }
      generate_bridge_pairing_code: {
        Args: { _event_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_guest_event_count: { Args: never; Returns: number }
      get_guest_join_limits: { Args: never; Returns: Json }
      get_ingest_token: { Args: { _event_id: string }; Returns: string }
      get_my_profile: { Args: never; Returns: Json }
      get_nickname: { Args: { _user_id: string }; Returns: string }
      get_public_profile: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_text: { Args: { _t: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recent_request_count: {
        Args: { _event_id: string; _seconds?: number }
        Returns: number
      }
      regenerate_ingest_token: {
        Args: { _event_id: string }
        Returns: undefined
      }
      remove_my_song_request: {
        Args: { _song_request_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      upgrade_anonymous_profile: {
        Args: { p_nickname?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "dj" | "guest" | "admin"
      error_severity: "critical" | "warning" | "info"
      point_tx_type: "earned" | "spent" | "manual_adjustment" | "refunded"
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
      app_role: ["dj", "guest", "admin"],
      error_severity: ["critical", "warning", "info"],
      point_tx_type: ["earned", "spent", "manual_adjustment", "refunded"],
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
