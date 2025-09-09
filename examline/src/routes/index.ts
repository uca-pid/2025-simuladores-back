import { type PrismaClient } from "@prisma/client"
import { type Express } from "express"
import UserRoute from "./user.route"

const addRoutes = (app: Express, prisma: PrismaClient) => {
    app.get('/', (req, res) => {
        res.send({
            message: "Hello world!"
        })
    })

    app.use('/users', UserRoute(prisma))
}

export default addRoutes