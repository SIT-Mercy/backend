import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import { AuthError } from "mercy-shared"
const testUsers = [
  { id: 1, username: "user1", password: "password1" },
  { id: 2, username: "user2", password: "password2" },
]

interface AuthenticatedRequest extends Request {
  studentId?: string
}

export async function startServer(): Promise<void> {
  const secret = "mysecretkey"
  const app = express()
  app.use(express.json())

  app.use((req: AuthenticatedRequest, res, next) => {
    // Skip "/login" itself
    if (req.path === "/login") {
      next()
      return
    }
    // Check if Authorization header is present
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.status(401)
      res.json({ error: AuthError.missingHeader })
      return
    }

    try {
      // Extract token from Authorization header
      const token = authHeader.split(" ")[1]
      // Verify token and decode payload
      const payload = jwt.verify(token, secret)

      // Attach payload to request object for later use
      req.studentId = payload.sub as string
      console.log(payload)
      // Call next middleware
      next()
    } catch (err) {
      // Return error if token is invalid
      res.status(401)
      res.json({ error: AuthError.invalidJwt })
    }
  })

  app.get("/", (req, res) => {
    res.status(200)
    res.contentType("text/plain")
    res.send("Hello world!")
    res.end()
  })
  app.post("/register", (req, res) => {

  })

  app.post("/login", (req, res) => {
    const { username, password } = req.body
    const user = testUsers.find(
      user => user.username === username && user.password === password
    )
    if (!user) {
      res.status(401)
      res.json({ error: AuthError.wrongStudentIdOrPassword })
      return
    }
    // Create JWT token
    const token = jwt.sign({ sub: user.id }, secret)

    // Send token in response
    res.json({ token })
  })

  app.listen(12878, () => {
    console.log("Server running at http://localhost:12878")
  })
}
