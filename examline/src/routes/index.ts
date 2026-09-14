import { type PrismaClient } from "@prisma/client"
import { type Express } from "express"
import UserRoute from "./user.route"
import ExamRoute from "./exam.route"
import ExamWindowRoute from "./examWindow.route"
import InscriptionRoute from "./inscription.route"
import ExamAttemptRoute from "./examAttempt.route"
import ExamFilesRoute from "./examFiles.route"
import ExamStartRoute from "./seb.route"
import CodeExecutionRoute from "./codeExecution.route"
import { createRankingRoutes } from "./ranking.route"
import MoodleRoute from "./moodle.route"
import path from "path"
import express from "express"

const addRoutes = (app: Express, prisma: PrismaClient) => {
    app.get('/', (req, res) => {
        res.send({
            message: "Hello world!"
        })
    })

    app.use('/users', UserRoute(prisma))
    app.use('/exams', ExamRoute(prisma))
    app.use('/exam-windows', ExamWindowRoute(prisma))
    app.use('/inscriptions', InscriptionRoute(prisma))
    app.use('/exam-attempts', ExamAttemptRoute(prisma))
    app.use('/exam-files', ExamFilesRoute(prisma))
    app.use("/exam-start", ExamStartRoute(prisma))
    app.use('/code-execution', CodeExecutionRoute(prisma))
    app.use('/moodle', MoodleRoute(prisma))
    app.use('/examenes', express.static(path.join(process.cwd(), "examenes")));


}

export default addRoutes