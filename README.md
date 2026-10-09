# Chess-AppWeb
App web2 Tp1

## Règles des échecs : chess.js

### Pourquoi chess.js

Les règles des échecs comportent beaucoup de cas particuliers : roque (avec ses conditions), prise en passant, promotion, clouage, interdiction de laisser son roi en échec, mat, pat. Les recoder soi-même serait long et risqué. [chess.js](https://github.com/jhlywa/chess.js) est la bibliothèque JavaScript de référence pour ces règles :

- elle connaît toutes les règles et détecte le mat et le pat ;
- elle lit et produit la **FEN**, le format qu'on stocke en base pour décrire une position ;
- elle donne chaque coup en notation **SAN** (`e4`, `Nf3`, `gxh8=Q`), lisible par un humain, que l'on garde dans la liste des coups ;
- elle n'a aucune dépendance et fonctionne aussi bien dans Node (validation) que dans le navigateur ;
- elle est maintenue, testée et largement utilisée.

L'affichage de l'échiquier est confié à une autre bibliothèque, `react-chessboard`, qui ne connaît pas les règles : chacune a son rôle.

### Comment on l'intègre

**Le serveur est l'arbitre.** Le client ne décide jamais si un coup est légal.

1. Le joueur dépose une pièce : le client envoie `POST /api/parties/:id/coups` avec `{ de: "e2", vers: "e4" }` (et `promotion: "q"` pour un pion qui arrive au bout).
2. Le serveur (`server/services/coups.js`) relit la partie en base et recrée la position avec `new Chess(partie.fen)`. On repart toujours de la FEN en base, jamais de ce qu'envoie le client.
3. Il vérifie, dans cet ordre : la partie existe (`404`), le joueur y participe (`403`), la partie est en cours (`409` « La partie est terminée. »), le coup est bien formé (`400`), c'est son tour avec `chess.turn()` (`409` « Ce n'est pas votre tour. »).
4. Il joue le coup avec `chess.move({ from, to, promotion })`. Si le coup est illégal, chess.js lance une exception et l'API répond `422` « Coup illégal. ».
5. La nouvelle FEN (`chess.fen()`) et le coup en SAN sont enregistrés **dans une même transaction** (`server/repository/parties.js`, `enregistrerCoup`) : la ligne de `parties` est mise à jour et une ligne est ajoutée dans `coups`. Si l'un échoue, rien n'est enregistré.
6. La mise à jour porte la condition `WHERE fen = <ancienne FEN>` : si deux coups arrivent en même temps sur la même position, un seul est accepté.

Comme la position et la liste des coups sont en base, une partie survit à un redémarrage du serveur.

**Côté client**, chess.js sert uniquement au confort d'affichage. Pendant l'envoi, on montre déjà la position après le coup (affichage optimiste). Dès que le serveur a répondu, la page affiche la FEN qu'il renvoie : si le coup est refusé, la pièce revient à sa place et le message d'erreur de l'API s'affiche.
