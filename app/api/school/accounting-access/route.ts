import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/src/lib/supabaseAdmin"
import { requirePermission } from "@/src/lib/apiAuth"

/*
 * Le promoteur ouvre ou ferme la comptabilité à son directeur général.
 *
 * ---------------------------------------------------------------------
 * POURQUOI CE N'EST PAS UN RÔLE DE PLUS
 *
 * On aurait pu inventer un « directeur_general_avec_comptabilite ». Ce
 * serait un second rôle à tenir à jour dans chaque liste, pour une seule
 * différence — et le jour où le promoteur change d'avis, il faudrait
 * renommer le compte au lieu de basculer un interrupteur.
 *
 * C'est donc un drapeau porté par l'ÉCOLE, pas par la personne : si le
 * directeur général est remplacé, la décision du promoteur reste en
 * place. `private.can_see_money()` le lit en base, et l'écran passe par
 * peutVoirComptabilite().
 * ---------------------------------------------------------------------
 *
 * C'est un droit de LECTURE, et rien d'autre : `can_write_money()` ne
 * nomme que le comptable, quelle que soit la valeur de ce drapeau.
 */

export async function PATCH(request: Request) {
  try {
    const guard = await requirePermission(request, "comptabilite.autoriser_dg")

    if (!guard.ok) {
      return guard.response
    }

    const body = await request.json()

    if (typeof body.autorise !== "boolean") {
      return NextResponse.json(
        { error: "Indiquez si le directeur général voit la comptabilité." },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from("schools")
      .update({ dg_voit_comptabilite: body.autorise })
      .eq("id", guard.context.schoolId)

    if (error) {
      console.error("Erreur autorisation comptable :", error)

      return NextResponse.json(
        { error: "Le réglage n'a pas pu être enregistré." },
        { status: 500 }
      )
    }

    return NextResponse.json({ autorise: body.autorise })
  } catch (error) {
    console.error("Erreur serveur :", error)

    return NextResponse.json(
      { error: "Une erreur interne est survenue." },
      { status: 500 }
    )
  }
}
