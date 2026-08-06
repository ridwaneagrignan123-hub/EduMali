# Brancher l'envoi WhatsApp

Le code est prêt. Ce qui reste est **administratif** et se fait une fois,
dans la console Meta, avec les identifiants de l'établissement. Aucune
ligne de code n'en dispense.

---

## Ce que le code fait déjà

`src/lib/whatsapp.ts` est le **seul** endroit qui parle au fournisseur.
Il envoie un message de MODÈLE à l'API Cloud de Meta et rend l'un de
trois états :

| État | Ce que ça veut dire |
|---|---|
| `sent` | Le fournisseur a accepté le message **et rendu un identifiant**. Rien de plus : ni arrivé, ni lu. |
| `en_attente` | Rien n'est parti, mais ça repartira — pas de réglage, pas de modèle, jeton expiré, panne, débit dépassé. |
| `failed` | Ça ne partira jamais — numéro absent, numéro qui n'est pas sur WhatsApp, modèle refusé. |

**La distinction entre `en_attente` et `failed` est le cœur du
dispositif.** Un jeton expiré et un numéro qui n'existe pas ne demandent
pas la même chose à l'école : le premier se corrige dans les réglages, le
second exige un coup de téléphone.

---

## Pourquoi des modèles, et pas du texte libre

Meta n'autorise le texte libre que dans les **24 heures** qui suivent un
message de la famille. Or une école écrit la première : une absence, un
bulletin, une relance de scolarité ne sont sollicités par personne.

Hors de cette fenêtre, il faut un modèle **pré-approuvé**, dont seuls les
paramètres varient. C'est pour cela que, sans nom de modèle déclaré,
l'adaptateur ne tente rien : envoyer du texte libre « au cas où »
remplirait la file d'échecs qui ressembleraient à une panne.

---

## Les six étapes, dans l'ordre

1. **Compte Meta Business** — https://business.facebook.com
2. **Vérification de l'entreprise** (Business Verification). Documents de
   l'établissement. Comptez plusieurs jours.
3. **Un numéro de téléphone dédié.** Il ne pourra plus servir dans
   l'application WhatsApp ordinaire. Prenez-en un neuf.
4. **Déposer les modèles** (voir ci-dessous) et attendre leur
   approbation.
5. **Créer un jeton permanent** via un utilisateur système — *pas* le
   jeton de test, qui expire au bout de 24 h.
6. **Poser les variables** dans Vercel (voir plus bas).

---

## Les modèles à déposer

Tous bâtis sur le **même squelette**, avec trois variables dans cet
ordre :

```
{{1}}  le nom de l'élève
{{2}}  le détail — la phrase composée par l'application
{{3}}  le nom de l'établissement
```

Catégorie : **Utilitaire** (`Utility`), jamais Marketing — c'est moins
cher et c'est la vérité : ce sont des notifications de service.

Corps suggéré :

> Bonjour, au sujet de {{1}} : {{2}} — {{3}}

Déposez-le dans **chaque langue** que l'école emploie (`fr`, `en`, `ar`).
Une école franco-arabe en a besoin en deux langues au minimum.

Sept modèles, un par événement :

| Événement | Variable à poser | Quand il part |
|---|---|---|
| `absence` | `WHATSAPP_MODELE_ABSENCE` | Élève absent |
| `retard` | `WHATSAPP_MODELE_RETARD` | Élève en retard |
| `retenue` | `WHATSAPP_MODELE_RETENUE` | Retenue posée |
| `violation_reglement` | `WHATSAPP_MODELE_VIOLATION` | Manquement au règlement |
| `report_card` | `WHATSAPP_MODELE_BULLETIN` | Bulletin disponible |
| `fee_overdue` | `WHATSAPP_MODELE_SCOLARITE` | Relance de scolarité |
| `devoir` | `WHATSAPP_MODELE_DEVOIR` | Devoir à la maison |

Vous pouvez n'en déposer qu'un ou deux pour commencer. Les événements
sans modèle restent simplement **en attente** — visibles comme tels dans
l'historique de l'élève, et rattrapables à la main.

---

## Les variables d'environnement

Dans Vercel, pour la production :

```
WHATSAPP_PHONE_NUMBER_ID=<l'identifiant du numéro, console Meta>
WHATSAPP_API_TOKEN=<le jeton permanent de l'utilisateur système>
WHATSAPP_MODELE_ABSENCE=<le nom exact du modèle approuvé>
```

Facultatives :

```
WHATSAPP_GRAPH_VERSION=v21.0     # défaut si absente
WHATSAPP_API_URL=<...>           # pour passer par un intermédiaire
                                 # plutôt que par Meta directement
```

`WHATSAPP_API_URL` l'emporte sur `WHATSAPP_PHONE_NUMBER_ID` : qui l'a
écrite savait ce qu'elle faisait.

**Tant que le jeton ou la destination manque, rien ne part et rien ne
prétend être parti.**

---

## Ce que ça coûte

Meta facture **au message livré** depuis le 1er juillet 2025, selon le
pays du destinataire et la catégorie. Les messages *utilitaires* sont
parmi les moins chers, et ceux envoyés **dans la fenêtre de 24 h** sont
gratuits.

Les tarifs par pays bougent ; vérifiez-les sur la grille de Meta avant de
vous engager sur un volume. Pour une école de 500 élèves qui enverrait
deux notifications par élève et par mois, comptez un ordre de grandeur de
quelques milliers de francs CFA mensuels — mais **ce chiffre est une
estimation, pas un devis**.

---

## Le SMS existe déjà, lui

`src/lib/africastalking.ts` implémente réellement l'envoi de SMS via
Africa's Talking, et `app/api/sms/send/route.ts` l'appelle. Il attend
seulement `AFRICASTALKING_USERNAME` et `AFRICASTALKING_API_KEY`.

C'est une voie de repli utile : le SMS n'exige aucun modèle approuvé et
touche les familles sans WhatsApp. Il coûte plus cher par message et
supporte mal l'arabe et les textes longs.
