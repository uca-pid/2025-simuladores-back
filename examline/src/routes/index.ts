import { type PrismaClient } from "@prisma/client"
import { type Express } from "express"
import UserRoute from "./user.route"
import ExamRoute from "./exam.route"
import ExamWindowRoute from "./examWindow.route"

const addRoutes = (app: Express, prisma: PrismaClient) => {
    app.get('/', (req, res) => {
        res.send({
            message: "Hello world!"
        })
    })

    app.use('/users', UserRoute(prisma))
    app.use('/exams', ExamRoute(prisma))
    app.use('/exam-windows', ExamWindowRoute(prisma))
}

export default addRoutes