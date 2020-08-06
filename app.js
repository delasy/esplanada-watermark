const fs = require('fs')
const path = require('path')

const tmpDirPath = path.join(__dirname, 'tmp')

if (!fs.existsSync(tmpDirPath)) {
  fs.mkdirSync(tmpDirPath)
}

const JSZip = require('jszip')
const express = require('express')
const helmet = require('helmet')
const multer = require('multer')({ dest: tmpDirPath })
const sharp = require('sharp')

sharp.cache(false)

const rm = (path) => {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

const processImage = async (imagePath) => {
  const image = await sharp(imagePath)
    .rotate()
    .toBuffer({ resolveWithObject: true })

  const w = image.info.width
  const h = image.info.height

  const watermark = await sharp(path.join(__dirname, 'watermark.svg'))
    .resize({
      height: Math.floor(w >= h ? h * 0.20 : w * 0.20)
    })
    .toBuffer({ resolveWithObject: true })

  return sharp(image.data)
    .flatten({ background: '#FFFFFF' })
    .composite([{
      input: watermark.data,
      left: Math.ceil(w * 0.95 - watermark.info.width),
      top: Math.ceil(h * 0.95 - watermark.info.height)
    }])
    .withMetadata()
    .jpeg()
    .toBuffer()
}

const routeGet = async (req, res) => {
  res.send(
    '<form enctype="multipart/form-data" method="POST">' +
    '<input accept="image/jpeg" multiple name="images" type="file" />' +
    '<button>Submit</button>' +
    '</form>'
  )
}

const routePost = async (req, res) => {
  req.socket.setTimeout(2 * 60 * 1000)

  const zip = new JSZip()

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i]
    const imgbuf = await processImage(file.path)
    const extnamelen = path.extname(file.originalname).length

    zip.file(file.originalname.slice(0, -1 * extnamelen) + '.jpg', imgbuf)
    await rm(file.path)
  }

  res.setHeader('Content-Disposition', 'attachment; filename="archive.zip"')
  zip.generateNodeStream({ type: 'nodebuffer' }).pipe(res)
}

const app = express()

app.use(helmet())
app.use(express.static('public'))

app.get('*', routeGet)
app.post('*', multer.any('images', 50), routePost)

app.listen(process.env.PORT || 8080)
