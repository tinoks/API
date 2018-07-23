process.env.NODE_DEBUG = 'fs'; 

const fs = require('fs');
const mkdirp  = require('mkdirp');

const express = require("express")
const app = express()

const { Pool } = require("pg")
const pool = new Pool({
  host: '80.241.215.222',
  database: 'test',
  user: 'postgres',
  password: 'Varchar2',
  port: 5432
})

const SphericalMercator = require("sphericalmercator")
const mercator = new SphericalMercator()

function generateTiles(res, layer, z, x, y){
		let bbox = mercator.bbox(x, y, z)	
		let dir = `./tiles/${layer}/${z}/${x}`
		let file = dir+`/${y}`

		columnsql = `SELECT  '  ' || 
				array_to_string(
					ARRAY(
						SELECT 'd' || '.' ||column_name FROM information_schema.columns as c
						WHERE table_name = '${layer}' and column_name != 'geom'
					),
				',') as string`;
				
				
	pool.query(columnsql, null, function(err, respond) {
		const sql = `
			SELECT ST_AsMVT( q,'${layer}', 4096, 'geom')
			FROM (SELECT 
					${respond.rows[0].string},
					ST_AsMVTGeom(
						geom,
						BBox(${x}, ${y}, ${z}),
						4096,
						256,
						true
					) geom
				FROM ${layer} d
				WHERE ST_Intersects(
						geom, 
						(SELECT ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, $5), 3857))
						)
			) q`
		const values = [bbox[0], bbox[1], bbox[2], bbox[3], 4326]
		pool.query(sql, values, function(err, mvt) {
				if (err) {
					console.log("asmvt error:",err)
				} else {
					let data = mvt.rows[0].st_asmvt;

					if(res){
						res.setHeader('Content-Type', 'application/x-protobuf')
						res.setHeader('Access-Control-Allow-Origin', '*')
						res.send(data)
					}
					
					console.log("wrote:",z,x,y);

					mkdirp(dir, (err) => {
					  if (err) return console.log(err);
					  fs.writeFile(dir+`/${y}`, data, (err) => {
						  if (err) return console.log(err);
					  });
					});

				}
		})
	})
	
}


app.use(express.static("./"))

app.get("/:layer/:z/:x/:y", function(req, res) {
	
	let dir = `./tiles/${req.params.layer}/${req.params.z}/${req.params.x}`
	let file = dir+`/${req.params.y}`
	if(fs.existsSync(file)){
		fs.readFile(file, function read(err, data) {
			res.setHeader('Content-Type', 'application/x-protobuf')
			res.setHeader('Access-Control-Allow-Origin', '*')
			res.send(data)
		})
	}else{
		generateTiles(res,req.params.layer,req.params.z,req.params.x,req.params.y)
	}
})

app.get('/generate/:layer', function (req, res) {
		
		
		pool.query(`SELECT ST_Extent(geom) as bbox FROM ${req.params.layer};`, null, function(err, respond) {
            if (err) {
                console.log("bbox error:",err)
            } else {
				let z = 10;
				
				//[[w,s][e,n]]
				let data = respond.rows[0].bbox.slice(4, -1).split(",").map(e => e.split(" ")).join().split(",");
				//[w, s, e, n]
				let bbox = mercator.xyz(data, z, false, '900913')
				
				for (; z > 0; z--) {
					bbox = mercator.xyz(data, z, false, '900913')
					x = bbox.maxX;
					for (; x >= bbox.minX; x--) {
						y = bbox.maxY;
						for (; y >= bbox.minY; y--) {
							generateTiles(null,req.params.layer,z,x,y)
							console.log(null,req.params.layer,z,x,y)
						}
					}
				}
				res.setHeader('Access-Control-Allow-Origin', '*')	
				res.send('generating tiles...')			  
			}
    })
})

app.listen(3000, () => {
    console.log("Listening on port 3000")
})

/*    

["1063274.05314144", "7328675.26864883"]
1
:
(2) ["1242025.90250111", "7513551.60209528"]
length
:
2
__proto__
:
Array(0)



map.addLayer({
	"id": "marker",
	"type": "fill",
	"source": {
		"type": "vector",
		"tiles": ["http://localhost:3000/tiles/marker/{z}/{x}/{y}"],
		"minzoom": 1,
		"maxzoom": 20
	},
	"source-layer": "marker",
	"layout": {
		},
	"paint": {
		"fill-color": "steelblue",
		"fill-opacity":0.5
	}
}, '');
	
*/