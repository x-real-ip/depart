import type { FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db.js";
import { toRecipe, toRecipeIngredient, type RecipeIngredientRow, type RecipeRow } from "../types.js";
import { Fields, NotFoundError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const RECIPE_KOLOMMEN = `id, trip_id, naam`;
const RECIPE_INGREDIENT_KOLOMMEN = `id, recipe_id, label, volgorde`;

async function haalRecipe(id: string): Promise<RecipeRow> {
  const row = await queryOne<RecipeRow>(`SELECT ${RECIPE_KOLOMMEN} FROM recipe WHERE id = $1`, [
    id,
  ]);
  if (!row) throw new NotFoundError("Dit gerecht bestaat niet");
  return row;
}

/** Gerechten voor op de camping: een naam en een lijst ingrediënten. */
export const recipeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/recipes", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<RecipeRow>(
      `SELECT ${RECIPE_KOLOMMEN} FROM recipe WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toRecipe);
  });

  app.post("/trips/:tripId/recipes", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);
    const row = await queryOne<RecipeRow>(
      `INSERT INTO recipe (trip_id, naam) VALUES ($1, $2) RETURNING ${RECIPE_KOLOMMEN}`,
      [tripId, fields.text("naam", { max: 120 })],
    );
    reply.code(201);
    return toRecipe(row!);
  });

  app.patch("/recipes/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await haalRecipe(id);
    const fields = new Fields(request.body);
    const naam = fields.has("naam") ? fields.text("naam", { max: 120 }) : bestaand.naam;

    const row = await queryOne<RecipeRow>(
      `UPDATE recipe SET naam = $2 WHERE id = $1 RETURNING ${RECIPE_KOLOMMEN}`,
      [id, naam],
    );
    return toRecipe(row!);
  });

  /** Verwijdert het gerecht. De ingrediënten gaan via cascade mee. */
  app.delete("/recipes/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM recipe WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit gerecht bestaat niet");
    reply.code(204);
    return null;
  });

  // --- Ingrediënten ---------------------------------------------------------

  app.get("/trips/:tripId/recipe-ingredients", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<RecipeIngredientRow>(
      `SELECT ri.id, ri.recipe_id, ri.label, ri.volgorde
       FROM recipe_ingredient ri
       JOIN recipe r ON r.id = ri.recipe_id
       WHERE r.trip_id = $1
       ORDER BY ri.volgorde ASC, ri.created_at ASC`,
      [tripId],
    );
    return result.rows.map(toRecipeIngredient);
  });

  app.post("/recipes/:id/recipe-ingredients", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    await haalRecipe(id);
    const fields = new Fields(request.body);
    const volgende = await queryOne<{ volgende: number }>(
      `SELECT COALESCE(max(volgorde) + 1, 0) AS volgende FROM recipe_ingredient WHERE recipe_id = $1`,
      [id],
    );
    const row = await queryOne<RecipeIngredientRow>(
      `INSERT INTO recipe_ingredient (recipe_id, label, volgorde) VALUES ($1, $2, $3)
       RETURNING ${RECIPE_INGREDIENT_KOLOMMEN}`,
      [id, fields.text("label", { max: 120 }), volgende?.volgende ?? 0],
    );
    reply.code(201);
    return toRecipeIngredient(row!);
  });

  app.patch("/recipe-ingredients/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<RecipeIngredientRow>(
      `SELECT ${RECIPE_INGREDIENT_KOLOMMEN} FROM recipe_ingredient WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Dit ingrediënt bestaat niet");

    const label = fields.has("label") ? fields.text("label", { max: 120 }) : bestaand.label;
    const row = await queryOne<RecipeIngredientRow>(
      `UPDATE recipe_ingredient SET label = $2 WHERE id = $1
       RETURNING ${RECIPE_INGREDIENT_KOLOMMEN}`,
      [id, label],
    );
    return toRecipeIngredient(row!);
  });

  app.delete("/recipe-ingredients/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM recipe_ingredient WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit ingrediënt bestaat niet");
    reply.code(204);
    return null;
  });
};
