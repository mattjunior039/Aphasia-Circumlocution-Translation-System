export const MODEL_OPTIONS = {
  minilm: { id: "Xenova/all-MiniLM-L6-v2", revision: "751bff37182d3f1213fa05d7196b954e230abad9", pooling: "mean", dimensions: 384 },
  bge: { id: "Xenova/bge-small-en-v1.5", revision: "ea104dacec62c0de699686887e3f920caeb4f3e3", pooling: "cls", dimensions: 384, queryPrefix: "Represent this sentence for searching relevant passages: " }
};

export function cosineRows(vector, data, senseIds, dimensions) {
  if (vector.length !== dimensions || data.length !== senseIds.length * dimensions) {
    throw new Error("The model and vocabulary index dimensions do not match.");
  }
  return senseIds.map((senseId, row) => {
    let similarity = 0;
    const offset = row * dimensions;
    for (let column = 0; column < dimensions; column++) similarity += vector[column] * data[offset + column];
    return { senseId, similarity };
  });
}
