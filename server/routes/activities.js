import { Router } from "express";

import { ACTIVITY_CATALOGUE } from "../services/activityCatalogue.js";

export function createActivitiesRouter() {
  const router = Router();

  router.get("/", (_request, response) => {
    response.status(200).json({
      maximumSelectedActivities: 6,
      activities: ACTIVITY_CATALOGUE.map(
        ({ id, name, description, environment }) => ({
          id,
          name,
          description,
          environment,
        }),
      ),
    });
  });

  return router;
}
