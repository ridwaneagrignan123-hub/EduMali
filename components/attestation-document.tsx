"use client"

/*
 * Le document lui-même, tel qu'il sort de l'imprimante.
 *
 * =====================================================================
 * IL NE LIT QUE LA PHOTOGRAPHIE
 * =====================================================================
 *
 * Ce composant ne reçoit AUCUNE clé étrangère et ne va chercher aucun
 * élève, aucune classe, aucun profil. Tout ce qu'il affiche vient des
 * colonnes figées de l'attestation, y compris le nom de l'école et
 * celui du signataire.
 *
 * C'est ce qui garantit qu'une réimpression dans trois ans dira
 * exactement ce que disait le papier remis aujourd'hui — même si
 * l'élève a changé de classe, si son nom a été corrigé, ou si le
 * directeur général a été remplacé.
 *
 * La seule chose lue au vol est l'EN-TÊTE VISUEL (logo, adresse,
 * téléphone), parce qu'elle relève de la papeterie et non du fait
 * certifié : un logo redessiné ne change pas ce qui est attesté. Le NOM
 * de l'école, lui, est figé — il fait partie de l'attestation.
 *
 * =====================================================================
 * UNE ATTESTATION ANNULÉE S'IMPRIME, ET SE VOIT
 * =====================================================================
 *
 * On peut réimprimer un document annulé : c'est parfois nécessaire pour
 * montrer à quelqu'un que le papier qu'il détient ne vaut plus. Mais il
 * porte alors un bandeau qui ne laisse aucun doute, y compris en
 * photocopie noir et blanc.
 */

export type AttestationImprimable = {
  reference: string
  kind: string
  subject_type: string
  school_name: string
  subject_full_name: string
  subject_birth_date: string | null
  subject_birth_place: string | null
  subject_matricule: string | null
  class_label: string | null
  academic_year_label: string | null
  role_label: string | null
  start_date: string | null
  end_date: string | null
  purpose: string | null
  issued_at: string
  signatory_name: string
  cancelled_at: string | null
  cancellation_reason: string | null
}

export type EnTeteEcole = {
  address: string | null
  phone: string | null
  logo_url: string | null
}

export const TITRES: Record<string, string> = {
  attestation_scolarite: "ATTESTATION DE SCOLARITÉ",
  attestation_travail: "ATTESTATION DE TRAVAIL",
  certificat_scolarite: "CERTIFICAT DE SCOLARITÉ",
  certificat_travail: "CERTIFICAT DE TRAVAIL",
}

function jour(date: string | null) {
  if (!date) return null

  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/*
 * Le corps du document, construit à partir des seuls faits figés.
 *
 * Les quatre formulations sont écrites en toutes lettres plutôt
 * qu'assemblées par morceaux : un certificat de travail ne se déduit pas
 * d'une attestation en changeant un temps de verbe. « Exerce depuis » et
 * « a exercé du … au … » n'engagent pas la même chose, et c'est
 * précisément ce que le lecteur du document vient vérifier.
 */
function corps(a: AttestationImprimable) {
  const naissance = a.subject_birth_date
    ? `, né(e) le ${jour(a.subject_birth_date)}${
        a.subject_birth_place ? ` à ${a.subject_birth_place}` : ""
      }`
    : ""

  const matricule = a.subject_matricule
    ? `, matricule ${a.subject_matricule}`
    : ""

  switch (a.kind) {
    case "attestation_scolarite":
      return `atteste que l'élève ${a.subject_full_name}${naissance}${matricule} est régulièrement inscrit(e) dans notre établissement${
        a.class_label ? `, en classe de ${a.class_label}` : ""
      }${
        a.academic_year_label
          ? `, au titre de l'année scolaire ${a.academic_year_label}`
          : ""
      }.`

    case "certificat_scolarite":
      return `atteste que l'élève ${a.subject_full_name}${naissance}${matricule} a été régulièrement inscrit(e) dans notre établissement${
        a.class_label ? `, en classe de ${a.class_label}` : ""
      }${
        a.academic_year_label
          ? `, au titre de l'année scolaire ${a.academic_year_label}`
          : ""
      }, jusqu'au ${jour(a.end_date)}.`

    case "attestation_travail":
      return `atteste que ${a.subject_full_name}${naissance} exerce au sein de notre établissement${
        a.role_label ? ` en qualité de ${a.role_label}` : ""
      }${a.start_date ? `, depuis le ${jour(a.start_date)}` : ""}.`

    case "certificat_travail":
      return `atteste que ${a.subject_full_name}${naissance} a exercé au sein de notre établissement${
        a.role_label ? ` en qualité de ${a.role_label}` : ""
      }${a.start_date ? `, du ${jour(a.start_date)}` : ""} au ${jour(
        a.end_date
      )}. L'intéressé(e) nous quitte libre de tout engagement.`

    default:
      return ""
  }
}

export function AttestationDocument({
  attestation,
  enTete,
}: {
  attestation: AttestationImprimable
  enTete: EnTeteEcole | null
}) {
  const annulee = Boolean(attestation.cancelled_at)

  return (
    <article className="attestation-feuille relative mx-auto max-w-[210mm] bg-white p-10 text-[15px] leading-relaxed text-black">
      {annulee && (
        /*
         * Bandeau plein et non filigrane pâle : un filigrane disparaît à
         * la photocopie, et c'est justement la photocopie qui circule.
         */
        <div className="mb-6 border-4 border-black p-3 text-center">
          <p className="text-2xl font-black tracking-widest">ANNULÉE</p>
          <p className="mt-1 text-sm">
            Annulée le {jour(attestation.cancelled_at)}
            {attestation.cancellation_reason
              ? ` — ${attestation.cancellation_reason}`
              : ""}
            . Ce document ne vaut plus.
          </p>
        </div>
      )}

      {/* --------------------------------------------------- en-tête */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex items-start gap-4">
          {enTete?.logo_url && (
            /*
              Balise <img> et non next/image, comme partout ailleurs pour
              ce logo. L'optimiseur exige que chaque hôte distant soit
              déclaré dans next.config ; le logo d'une école vit sur le
              stockage Supabase, mais rien n'interdit à une école de
              coller l'URL d'un autre hébergeur. Déclarer un hôte fixe
              casserait ces écoles-là, à l'impression, sans prévenir.
            */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={enTete.logo_url}
              alt=""
              className="h-16 w-16 object-contain"
            />
          )}

          <div>
            <p className="text-lg font-bold uppercase">
              {attestation.school_name}
            </p>

            {enTete?.address && (
              <p className="text-sm">{enTete.address}</p>
            )}

            {enTete?.phone && <p className="text-sm">Tél. {enTete.phone}</p>}
          </div>
        </div>

        <div className="text-end text-sm">
          <p className="font-semibold">Réf. {attestation.reference}</p>
        </div>
      </header>

      {/* ----------------------------------------------------- titre */}
      <h1 className="mt-12 text-center text-2xl font-bold uppercase tracking-wide underline">
        {TITRES[attestation.kind] ?? "ATTESTATION"}
      </h1>

      {/* ----------------------------------------------------- corps */}
      <div className="mt-12 space-y-6">
        <p>
          Je soussigné(e), <strong>{attestation.signatory_name}</strong>,
          Directeur général de l&apos;établissement{" "}
          <strong>{attestation.school_name}</strong>, {corps(attestation)}
        </p>

        {/*
          « Le présent certificat » ou « la présente attestation » : le
          document se nomme lui-même par ce qu'il est. Écrire « la
          présente attestation » en bas d'un certificat de travail ferait
          douter de tout le reste.
        */}
        <p>
          En foi de quoi{" "}
          {attestation.kind.startsWith("certificat")
            ? "le présent certificat lui est délivré"
            : "la présente attestation lui est délivrée"}{" "}
          {attestation.purpose?.trim()
            ? attestation.purpose.trim()
            : "pour servir et valoir ce que de droit"}
          .
        </p>
      </div>

      {/* -------------------------------------------------- signature */}
      <div className="mt-20 flex justify-end">
        <div className="w-64 text-center">
          <p className="text-sm">Fait le {jour(attestation.issued_at)}</p>

          <p className="mt-1 font-semibold">Le Directeur général</p>

          {/* L'espace de la signature manuscrite et du cachet. */}
          <div className="h-24" />

          <p className="border-t border-black pt-1 font-medium">
            {attestation.signatory_name}
          </p>
        </div>
      </div>

      <footer className="mt-12 border-t pt-3 text-center text-xs text-neutral-600">
        Document n° {attestation.reference} — établi par {attestation.school_name}.
        Toute vérification peut être faite auprès de l&apos;établissement en
        citant cette référence.
      </footer>
    </article>
  )
}
