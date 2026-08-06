import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/logo"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { TITRES } from "@/src/lib/attestations"

/*
 * La vérification d'une attestation.
 *
 * =====================================================================
 * CE QUE CETTE PAGE RÉPOND, ET CE QU'ELLE TAIT
 * =====================================================================
 *
 * Elle s'adresse à quelqu'un qui tient un papier : une banque, un lycée,
 * un employeur. Il n'a pas besoin qu'on lui récite le document — il l'a
 * sous les yeux. Il a besoin de savoir si l'établissement le reconnaît.
 *
 * On rend donc de quoi CONFRONTER le papier à la base : la référence, le
 * type, l'école, le nom de l'intéressé, la date d'émission, le
 * signataire. Si l'un de ces éléments diffère du papier, la vérification
 * a fait son travail.
 *
 * On TAIT en revanche tout ce qui ne sert pas à confronter : la date de
 * naissance, le matricule, la classe, le motif de délivrance. Ces
 * mentions figurent sur le papier de celui qui le détient légitimement ;
 * les afficher ici les livrerait à quiconque scanne le document par-
 * dessus une épaule.
 *
 * LE MOTIF D'ANNULATION EST TU, LUI AUSSI. Le fait qu'une attestation
 * soit annulée regarde le porteur ; la raison pour laquelle l'école l'a
 * retirée est une affaire interne, et parfois désobligeante. On dit
 * « annulée le tant », on ne dit pas pourquoi.
 *
 * =====================================================================
 * LECTURE PAR JETON, JAMAIS PAR RÉFÉRENCE
 * =====================================================================
 *
 * L'adresse porte un jeton aléatoire de 16 octets, imprimé nulle part
 * ailleurs que dans le QR. Une page indexée sur « ATT-2026-0001 »
 * s'énumérerait, et le premier curieux venu récolterait les noms des
 * élèves d'un établissement sans avoir jamais tenu un papier.
 *
 * La lecture passe par la clé service role : la table `attestations` est
 * fermée à `anon`, et elle doit le rester. Aucune policy publique n'a été
 * ajoutée pour cette page.
 */

export const metadata: Metadata = {
  title: "Vérification d'un document",
  robots: { index: false, follow: false },
}

const NUIT = "oklch(17% 0.018 55)"
const SABLE = "oklch(95% 0.015 85)"
const VERT = "oklch(60% 0.13 155)"
const ARGILE = "oklch(60% 0.17 38)"
const TRAIT = "oklch(95% 0.015 85 / 0.12)"
const DOUCE = "oklch(22% 0.02 55)"
const ESTOMPE = "oklch(95% 0.015 85 / 0.62)"

const display = "var(--font-bricolage), sans-serif"

function jour(date: string | null) {
  if (!date) return null

  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ jeton: string }>
}) {
  const { jeton } = await params

  /*
   * Le jeton est confronté à sa forme AVANT toute requête : 32 chiffres
   * hexadécimaux, ni plus ni moins. Une adresse fantaisiste n'atteint
   * même pas la base.
   */
  const valide = /^[0-9a-f]{32}$/.test(jeton)

  const { data } = valide
    ? await supabaseAdmin
        .from("attestations")
        .select(
          "reference, kind, school_name, subject_full_name, issued_at, signatory_name, cancelled_at"
        )
        .eq("verification_token", jeton)
        .maybeSingle()
    : { data: null }

  const annulee = Boolean(data?.cancelled_at)

  return (
    <div
      style={{
        fontFamily: "var(--font-manrope), sans-serif",
        background: NUIT,
        color: SABLE,
        minHeight: "100vh",
      }}
    >
      <nav
        style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${TRAIT}`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Link href="/" style={{ display: "inline-flex" }}>
          <Logo dark />
        </Link>
      </nav>

      <main style={{ padding: "56px 24px 80px", maxWidth: 560, margin: "0 auto" }}>
        {!data ? (
          /* ------------------------------------------- introuvable */
          <>
            <div
              style={{
                border: `2px solid ${ARGILE}`,
                borderRadius: 18,
                padding: "26px 24px",
                textAlign: "center",
                marginBottom: 26,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: display,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: ARGILE,
                }}
              >
                Document inconnu
              </p>
            </div>

            <p style={{ fontSize: 16.5, lineHeight: 1.65, color: ESTOMPE, margin: 0 }}>
              Aucun document ne correspond à ce code. Vérifiez que le QR a été
              scanné en entier, ou adressez-vous à l&apos;établissement qui a
              délivré le papier.
            </p>
          </>
        ) : (
          <>
            {/* ------------------------------------------- le verdict */}
            <div
              style={{
                border: `2px solid ${annulee ? ARGILE : VERT}`,
                borderRadius: 18,
                padding: "26px 24px",
                textAlign: "center",
                marginBottom: 26,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: display,
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: annulee ? ARGILE : VERT,
                }}
              >
                {annulee ? "Document annulé" : "Document authentique"}
              </p>

              <p style={{ margin: "8px 0 0", fontSize: 15.5, color: ESTOMPE }}>
                {annulee
                  ? `Ce document a été annulé le ${jour(data.cancelled_at)} par l'établissement. Il ne vaut plus.`
                  : `Ce document a bien été délivré par ${data.school_name}.`}
              </p>
            </div>

            {/* ------------------------------------ de quoi confronter */}
            <dl
              style={{
                margin: 0,
                border: `1px solid ${TRAIT}`,
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <Ligne intitule="Référence" valeur={data.reference} />
              <Ligne
                intitule="Nature"
                valeur={TITRES[data.kind] ?? data.kind}
              />
              <Ligne intitule="Établissement" valeur={data.school_name} />
              <Ligne intitule="Concerne" valeur={data.subject_full_name} />
              <Ligne intitule="Délivré le" valeur={jour(data.issued_at) ?? "—"} />
              <Ligne intitule="Signataire" valeur={data.signatory_name} dernier />
            </dl>

            <p
              style={{
                marginTop: 24,
                fontSize: 14.5,
                lineHeight: 1.65,
                color: "oklch(95% 0.015 85 / 0.5)",
              }}
            >
              Confrontez ces mentions au papier que vous détenez. Si l&apos;une
              d&apos;elles diffère, le document n&apos;est pas celui que
              l&apos;établissement a délivré.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Ligne({
  intitule,
  valeur,
  dernier,
}: {
  intitule: string
  valeur: string
  dernier?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 18px",
        background: DOUCE,
        borderBottom: dernier ? "none" : `1px solid ${TRAIT}`,
      }}
    >
      <dt style={{ fontSize: 14.5, color: ESTOMPE }}>{intitule}</dt>
      <dd style={{ margin: 0, fontSize: 15.5, fontWeight: 600, textAlign: "end" }}>
        {valeur}
      </dd>
    </div>
  )
}
